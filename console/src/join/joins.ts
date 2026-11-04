/**
 * Adding a site (spec §6 *Connecting a machine*). The fleet admin gets a one-time code; hq is given only its lookup,
 * so hq — which relays every step — can neither join a machine of its own nor stand between the two. A joining
 * machine's half is accepted only with a binding over its own fingerprint that needs the code; the fleet admin then
 * compares the fingerprint, and on confirmation the console sends its own binding, pins the machine, has its host
 * service install the site with a signed command, and registers the credential hash the host service answered with.
 *
 * The code lives in memory only, until the machine is accepted or the code expires: a restart forgets it, and the
 * fleet admin makes another.
 *
 * hq's own machine joins the same way at install, with no person to confirm it: the host service asks for a code
 * through the control socket (control/socket.ts), on the machine's authority, and that one join is confirmed as soon
 * as a request with a binding that proves its code arrives. Its site is hq's default site, already running and
 * connected by configuration, so nothing is installed.
 */
import { randomUUID } from 'node:crypto'
import {
  JOIN_CODE_TTL_MS, formatFingerprint, formatJoinCode, isPublishedVersion, parseRestoreClaim,
  type HostActor, type HostIdentity, type JoinPurpose, type JoinRestoreClaim,
} from '@agenthix/core'
import {
  fingerprintOf, generateJoinCode, isHostIdentity, joinLookup, consoleJoinBinding, verifyHostJoinBinding,
  type HostKeys,
} from '@agenthix/core/host-crypto'
import type { Activity } from '../activity'
import type { HqLink } from '../hq/link'
import type { PinnedHost, PinnedHosts } from '../state/hosts'
import { installSite } from './installSite'
import { restoreSite } from './restoreSite'
import { hqClaimHolder, inFleetOnline, view, type JoinView } from './view'
import { nameTakenBy, nameTakenText } from './names'
import type { HostCommands } from '../hosts/commands'
import type { Presence } from '../hosts/presence'

export type { JoinView } from './view'

export type JoinState = 'waiting' | 'confirming' | 'accepting' | 'installing' | 'restoring' | 'done' | 'failed'

export type FleetAdmin = HostActor & { kind: 'fleetAdmin' }

export type Join = {
  joinId: string
  code: string | null
  expiresAt: number
  purpose: JoinPurpose
  /** Opened on the machine's authority for hq's own machine: confirmed without a person. */
  local: boolean
  state: JoinState
  machine: { name: string; identity: HostIdentity; fingerprint: string } | null
  /** The fleet's machine with the same fingerprint, offline when it answered: confirming replaces it. */
  replaces: PinnedHost | null
  siteName: string | null
  problem: string | null
  timer: ReturnType<typeof setTimeout> | null
  /** The machine said, under its binding, that its host service runs hq. */
  claimsHq: boolean
  /** The backup the machine said, under its binding, it restores the lost site from (adr-0119). */
  restores: JoinRestoreClaim | null
  /** Whether the fleet admins are told when the machine stops answering, as asked with the code (hosts/silence.ts). */
  notify: boolean
}

const MACHINE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,62}$/u
/** How long a finished join is still shown, so the screen can read how it ended. */
const KEEP_FINISHED_MS = 60 * 60_000

export class JoinError extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message)
  }
}

export type JoinDeps = {
  keys: HostKeys
  link: HqLink
  hosts: PinnedHosts
  commands: HostCommands
  presence: Presence
  activity: Activity
  version: string
}

export class Joins {
  private readonly joins = new Map<string, Join>()
  /** A machine confirmed for a move's code: it receives the site and installs none (move/moves.ts). */
  private moveConfirmed: ((joinId: string, fingerprint: string, by: FleetAdmin) => Promise<void>) | null = null

  constructor(private readonly deps: JoinDeps) {
    deps.link.on('joinRequest', frame => {
      this.onRequest(frame).catch(err => console.error('[console] join request failed:', err instanceof Error ? err.message : err))
    })
  }

  /** Step 1: a code for the fleet admin. Only its lookup goes to hq. */
  async open(by: FleetAdmin, notify = true): Promise<JoinView & { code: string }> {
    const join = await this.create({ kind: 'add' }, JOIN_CODE_TTL_MS, false, notify)
    await this.deps.activity.record(by.userId, 'site.addStarted', 'A one-time code to add a site', false)
    return { ...view(join, this.deps.hosts, this.deps.presence), code: formatJoinCode(join.code!) }
  }

  /**
   * A code for *Move site…* (spec §13): the machine that connects with it waits to receive that site. `by` null: the
   * machine admin of the site's machine asked, with `site schedule move`.
   */
  async openMove(by: FleetAdmin | null, executionSiteId: string | null, siteName: string, notify = true): Promise<{ joinId: string; code: string; expiresAt: string }> {
    // *Move HQ…* (executionSiteId null): the machine that connects with it waits to receive hq and its default site.
    const join = await this.create(executionSiteId ? { kind: 'moveSite', siteId: executionSiteId } : { kind: 'moveHq' }, JOIN_CODE_TTL_MS, false, notify)
    join.siteName = siteName
    await this.deps.activity.record(by?.userId ?? null, executionSiteId ? 'site.moveStarted' : 'hq.moveStarted',
      executionSiteId ? `A one-time code to move ${siteName} to a new machine` : 'A one-time code to move HQ to a new machine', false)
    return { joinId: join.joinId, code: formatJoinCode(join.code!), expiresAt: new Date(join.expiresAt).toISOString() }
  }

  whenMoveConfirmed(listener: (joinId: string, fingerprint: string, by: FleetAdmin) => Promise<void>): void {
    this.moveConfirmed = listener
  }

  /**
   * A code for *Restore from a backup…* (adr-0119): the machine that connects with it restores the lost site from a
   * backup chosen there, and takes the place of the machine the site ran on — named by its fingerprint. Only for a
   * site whose machine is offline.
   */
  async openRestore(by: FleetAdmin, lostFingerprint: string, notify = true): Promise<JoinView & { code: string }> {
    const lost = this.deps.hosts.byFingerprint(lostFingerprint)
    const executionSiteId = lost?.executionSiteId
    if (!lost || !executionSiteId) throw new JoinError(404, 'That machine carries no site in the fleet.')
    if (lost.hqMachine) throw new JoinError(409, `${lost.siteName} is HQ's own site: it comes back with HQ, from the backup of HQ's machine.`)
    if (this.deps.presence.of(lost.fingerprint).online) {
      throw new JoinError(409, `${lost.machineName} is online, so it is not lost. To give it a new machine, use Move site… on its page.`)
    }
    const join = await this.create({ kind: 'restoreSite', siteId: executionSiteId }, JOIN_CODE_TTL_MS, false, notify)
    join.siteName = lost.siteName
    await this.deps.activity.record(by.userId, 'site.addStarted', `A one-time code to restore ${lost.siteName} onto a new machine`, false)
    return { ...view(join, this.deps.hosts, this.deps.presence), code: formatJoinCode(join.code!) }
  }

  /** A code for hq's own machine, asked for by the host service at install; this join alone confirms itself. */
  async openLocal(ttlMs: number): Promise<{ code: string }> {
    const join = await this.create({ kind: 'add' }, ttlMs, true)
    await this.deps.activity.record(null, 'site.addStarted', "A one-time code to join HQ's own machine, at install", false)
    return { code: formatJoinCode(join.code!) }
  }

  private async create(purpose: JoinPurpose, ttlMs: number, local: boolean, notify = true): Promise<Join> {
    const code = generateJoinCode()
    const expiresAt = Date.now() + ttlMs
    const { joinId } = await this.deps.link.call('join.open', {
      lookup: await joinLookup(code), expiresAt: new Date(expiresAt).toISOString(), purpose,
    })
    const join: Join = {
      joinId, code, expiresAt, purpose, local, state: 'waiting', machine: null, replaces: null, siteName: null, problem: null, timer: null,
      claimsHq: false, restores: null, notify,
    }
    join.timer = setTimeout(() => this.expire(joinId), ttlMs)
    join.timer.unref?.()
    this.joins.set(joinId, join)
    return join
  }

  get(joinId: string): JoinView | null {
    const join = this.joins.get(joinId)
    return join ? view(join, this.deps.hosts, this.deps.presence) : null
  }

  /** Step 3: hq passes the joining machine's half. Anything that does not prove the code is ignored. */
  async onRequest(frame: unknown): Promise<void> {
    const f = frame && typeof frame === 'object' ? (frame as Record<string, unknown>) : {}
    const join = typeof f.joinId === 'string' ? this.joins.get(f.joinId) : undefined
    if (!join || join.state !== 'waiting' || !join.code || join.expiresAt <= Date.now()) return
    if (!isHostIdentity(f.identity) || f.identity.role !== 'host') return
    if (typeof f.machineName !== 'string' || !MACHINE_NAME.test(f.machineName) || typeof f.binding !== 'string') return
    // "This machine runs HQ" counts only under the binding, which hq cannot make: added or dropped on the way, it fails.
    if (f.runsHq !== undefined && f.runsHq !== true) return
    // So is the backup a machine restores a lost site from: only with a code for restoring, and always with one.
    const restores = f.restores === undefined ? null : parseRestoreClaim(f.restores)
    if (f.restores !== undefined && !restores) return
    if ((join.purpose.kind === 'restoreSite') !== (restores !== null)) return
    const claims = { ...(f.runsHq === true ? { runsHq: true as const } : {}), ...(restores ? { restores } : {}) }
    const fingerprint = await fingerprintOf(f.identity)
    if (!(await verifyHostJoinBinding(join.code, fingerprint, f.binding, claims))) return
    if (join.state !== 'waiting') return
    join.machine = { name: f.machineName, identity: f.identity, fingerprint }
    join.claimsHq = f.runsHq === true
    join.restores = restores
    // A machine already in the fleet cannot be joined over while it is online: whoever holds this code is not it.
    const already = this.deps.hosts.byFingerprint(fingerprint)
    if (already && this.deps.presence.of(fingerprint).online) return this.turnAway(join, inFleetOnline(already))
    // A site is called by its machine's name, so two machines of the same name cannot both be sites.
    const taken = nameTakenBy(this.deps.hosts, join.purpose, fingerprint, f.machineName)
    if (taken) return this.turnAway(join, nameTakenText(taken))
    join.replaces = already
    join.state = 'confirming'
    if (join.local) {
      // Asked once, never again: if hq's link fails now, the join ends as failed so it can be reported, not waited out.
      await this.accept(join, null, join.machine.name).catch(async err => {
        console.error('[console] accepting hq\'s own machine failed:', err instanceof Error ? err.message : err)
        await this.turnAway(join, "HQ's own machine could not be accepted just now, because HQ did not answer. Make a new code and try again.")
      })
    }
  }

  private async turnAway(join: Join, why: string): Promise<void> {
    join.code = null
    if (join.timer) clearTimeout(join.timer)
    join.timer = null
    this.finished(join, 'failed', why)
    await this.deps.link.call('join.refuse', { joinId: join.joinId }).catch(() => {})
  }

  /**
   * Step 4: the fleet admin compared the fingerprint and confirms. Then the site is installed and registered, named
   * after its machine: no other name is asked.
   */
  async confirm(joinId: string, by: FleetAdmin, options: { version?: string }): Promise<JoinView> {
    const join = this.joins.get(joinId)
    if (!join) throw new JoinError(404, 'No such code, or it has expired.')
    if (join.purpose.kind === 'restoreSite') return this.confirmRestore(join, by, join.purpose.siteId)
    if (join.purpose.kind !== 'add') return this.confirmMove(join, by)
    if (join.claimsHq && !join.local) return this.confirmHqMachine(join, by)
    // A development build installs the site built on the machine itself (its host service refuses unless it is a
    // development build too); a published one installs a published version.
    const version = options.version ?? this.deps.version
    const development = version === 'dev' && this.deps.version === 'dev'
    if (!development && !isPublishedVersion(version)) throw new JoinError(409, 'Say which published version the site installs, for example 0.2.0.')
    if (join.state === 'failed' && join.siteName && join.machine && this.deps.hosts.byFingerprint(join.machine.fingerprint)) {
      this.install(join, by, version)
      return view(join, this.deps.hosts, this.deps.presence)
    }
    if (join.local || join.state !== 'confirming' || !join.machine || !join.code) {
      throw new JoinError(409, 'No machine is waiting to be confirmed with this code.')
    }
    const replaced = join.replaces
    if (replaced) {
      // It may have come online since: then this join is not that machine, and is turned away.
      if (this.deps.presence.of(replaced.fingerprint).online) {
        await this.turnAway(join, inFleetOnline(replaced))
        throw new JoinError(409, inFleetOnline(replaced))
      }
      // A machine carries one site: the one it carried goes from hq before the machine joins again.
      if (replaced.executionSiteId) {
        // Held as accepting before the first wait, so a second confirm meets the state check and not this removal.
        join.state = 'accepting'
        try {
          await this.deps.link.call('site.remove', { executionSiteId: replaced.executionSiteId })
          this.deps.hosts.update(replaced.fingerprint, { executionSiteId: null })
        } catch (err) {
          join.state = 'confirming'
          throw err
        }
      }
    }
    await this.accept(join, by, join.machine.name)
    this.install(join, by, version)
    return view(join, this.deps.hosts, this.deps.presence)
  }

  /**
   * HQ's machine joining a Fleet Console started anew (spec §7, after `hq console-code --no-machines`): its own site
   * runs already, so none is installed. The fleet admin saw the claim before confirming, and this confirmation alone
   * marks it as HQ's machine — and only while no other machine holds the mark.
   */
  private async confirmHqMachine(join: Join, by: FleetAdmin): Promise<JoinView> {
    if (join.state !== 'confirming' || !join.machine || !join.code) throw new JoinError(409, 'No machine is waiting to be confirmed with this code.')
    if (join.replaces && this.deps.presence.of(join.replaces.fingerprint).online) {
      await this.turnAway(join, inFleetOnline(join.replaces))
      throw new JoinError(409, inFleetOnline(join.replaces))
    }
    const holder = hqClaimHolder(this.deps.hosts, join.machine.fingerprint)
    await this.accept(join, by, join.machine.name, holder === null)
    if (holder) {
      this.finished(join, 'done', `${join.machine.name} is connected, but not marked as HQ's machine: ${holder.machineName} holds the mark.`)
    } else {
      this.finished(join, 'done')
      await this.deps.activity.record(by.userId, 'hq.machineMarked', `${join.machine.name} (${formatFingerprint(join.machine.fingerprint)}), which said it runs HQ`, true)
    }
    return view(join, this.deps.hosts, this.deps.presence)
  }

  /**
   * A move's new machine: pinned like any, with no site of its own and no site's name — it carries the site only once
   * the move finishes (move/moves.ts). The join keeps the moving site's name for the words on the screen.
   */
  private async confirmMove(join: Join, by: FleetAdmin): Promise<JoinView> {
    if (join.state !== 'confirming' || !join.machine || !join.code) throw new JoinError(409, 'No machine is waiting to be confirmed with this code.')
    // Read again: a fleet admin may have removed it since the machine asked.
    const listed = join.replaces && this.deps.hosts.byFingerprint(join.replaces.fingerprint)
    if (listed) {
      throw new JoinError(409, this.deps.presence.of(listed.fingerprint).leftAt
        ? `${listed.machineName} left the fleet by itself, and is still listed. Remove it from the fleet first, then confirm again.`
        : 'This machine is already in the fleet; a site moves to a machine that joins with the code.')
    }
    const machine = join.machine
    await this.accept(join, by, join.siteName ?? machine.name)
    this.finished(join, 'done')
    // Setting the move up waits for the machine to come online and answer: the fleet admin follows it on the move.
    void this.moveConfirmed?.(join.joinId, machine.fingerprint, by).catch(err => {
      join.problem = err instanceof Error ? err.message : 'The move could not be set up.'
    })
    return view(join, this.deps.hosts, this.deps.presence)
  }

  /**
   * A restore's new machine (adr-0119): pinned like any, with no site yet, then asked to restore the backup its machine
   * admin chose. Refused if the lost site's machine has come back meanwhile: then the site is not lost.
   */
  private async confirmRestore(join: Join, by: FleetAdmin, executionSiteId: string): Promise<JoinView> {
    if (join.state !== 'confirming' || !join.machine || !join.code || !join.restores) throw new JoinError(409, 'No machine is waiting to be confirmed with this code.')
    if (join.replaces) throw new JoinError(409, 'This machine is already in the fleet; a lost site is restored onto a machine that joins with the code.')
    const lost = this.deps.hosts.list().find(h => h.executionSiteId === executionSiteId)
    if (!lost) throw new JoinError(404, 'That site is no longer in the fleet. Nothing was restored.')
    if (this.deps.presence.of(lost.fingerprint).online) {
      await this.refuse(join.joinId, by)
      throw new JoinError(409, `${lost.machineName} came back online, so it is not lost. Nothing was restored, and the code is spent.`)
    }
    const machine = join.machine
    await this.accept(join, by, join.siteName ?? lost.siteName, false,
      `${machine.name} (${formatFingerprint(machine.fingerprint)}), to restore ${lost.siteName} from its backup of ${join.restores.takenAt}`)
    join.state = 'restoring'
    restoreSite(this.deps, { fingerprint: machine.fingerprint, lost, executionSiteId, by })
      .then(({ warning }) => this.finished(join, 'done', warning))
      .catch(err => this.finished(join, 'failed', err instanceof Error ? err.message : 'The site could not be restored.'))
    return view(join, this.deps.hosts, this.deps.presence)
  }

  /**
   * Sends the console's binding, pins the machine and records it. `by` null: the machine admin, for hq's machine.
   * `hqMachine`: a fleet admin confirmed a machine that said it runs hq, and no other holds the mark. `siteName` is the
   * site the join is about, for the words; the machine is pinned with its own name for its site's, or none while it
   * waits to receive a site that moves.
   */
  private async accept(join: Join, by: FleetAdmin | null, siteName: string, hqMachine = false, restoring?: string): Promise<void> {
    join.state = 'accepting'
    const { machine, code, joinId } = join
    if (!machine || !code) throw new Error('A join is accepted only with its machine and its code.')
    try {
      const consoleFp = await fingerprintOf(this.deps.keys.identity)
      const { hostId } = await this.deps.link.call('join.accept', {
        joinId,
        acceptance: {
          identity: { role: 'console', signingKey: this.deps.keys.identity.signingKey, sealingKey: this.deps.keys.identity.sealingKey },
          binding: await consoleJoinBinding(code, consoleFp, machine.fingerprint),
        },
      })
      const moving = join.purpose.kind === 'moveSite' || join.purpose.kind === 'moveHq'
      await this.deps.hosts.pin({
        fingerprint: machine.fingerprint, hostId, identity: machine.identity, machineName: machine.name, siteName: moving ? '' : machine.name,
        executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: by?.userId ?? null,
        ...(join.local || (hqMachine && by !== null && join.claimsHq) ? { hqMachine: true } : { notifyIfSilent: join.notify }),
      })
    } catch (err) {
      join.state = 'confirming'
      throw err
    }
    join.code = null
    join.siteName = siteName
    if (join.timer) clearTimeout(join.timer)
    join.timer = null
    const fp = formatFingerprint(machine.fingerprint)
    if (join.purpose.kind === 'moveSite' || join.purpose.kind === 'moveHq') {
      // Part of the move, not a site added: the machine waits to receive one, and the move is recorded as it goes.
      const hq = join.purpose.kind === 'moveHq'
      await this.deps.activity.record(by?.userId ?? null, hq ? 'hq.moveMachineJoined' : 'site.moveMachineJoined',
        `${machine.name} joined to receive ${hq ? 'HQ' : siteName} (${fp})`, false)
    } else {
      // A restore is announced by HQ once the site's credential is renewed there (adr-0119), so not twice.
      await this.deps.activity.record(by?.userId ?? null, 'site.added', restoring ?? `${machine.name} (${fp})`, !restoring)
    }
    if (join.local) this.finished(join, 'done')
  }

  /** The fleet admin does not recognise the machine: hq turns it away, and the code is spent. */
  async refuse(joinId: string, by: FleetAdmin): Promise<void> {
    const join = this.joins.get(joinId)
    if (!join || join.local || (join.state !== 'confirming' && join.state !== 'waiting')) throw new JoinError(404, 'No such code, or it has expired.')
    await this.deps.link.call('join.refuse', { joinId })
    await this.deps.activity.record(by.userId, 'site.addRefused', join.machine ? `${join.machine.name} (${formatFingerprint(join.machine.fingerprint)})` : 'A one-time code', false)
    this.forget(joinId)
  }

  async cancel(joinId: string): Promise<void> {
    if (!this.joins.has(joinId)) throw new JoinError(404, 'No such code, or it has expired.')
    const join = this.joins.get(joinId)!
    if (join.local) throw new JoinError(404, 'No such code, or it has expired.')
    if (join.state !== 'waiting' && join.state !== 'confirming') throw new JoinError(409, 'This machine has already been accepted.')
    await this.deps.link.call('join.close', { joinId }).catch(() => {})
    this.forget(joinId)
  }

  private install(join: Join, by: FleetAdmin, version: string): void {
    join.state = 'installing'
    join.problem = null
    const machine = join.machine!
    installSite(this.deps, { fingerprint: machine.fingerprint, version, by })
      .then(() => this.finished(join, 'done'))
      .catch(err => this.finished(join, 'failed', err instanceof Error ? err.message : 'The site could not be installed.'))
  }

  private finished(join: Join, state: 'done' | 'failed', problem: string | null = null): void {
    join.state = state
    join.problem = problem
    const timer = setTimeout(() => this.joins.delete(join.joinId), KEEP_FINISHED_MS)
    timer.unref?.()
  }

  private expire(joinId: string): void {
    const join = this.joins.get(joinId)
    if (!join || (join.state !== 'waiting' && join.state !== 'confirming')) return
    this.deps.link.call('join.close', { joinId }).catch(() => {})
    this.forget(joinId)
  }

  private forget(joinId: string): void {
    const join = this.joins.get(joinId)
    if (join?.timer) clearTimeout(join.timer)
    if (join) join.code = null
    this.joins.delete(joinId)
  }
}
