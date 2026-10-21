/**
 * *Move site…* (spec §13 *A site moves*, §14), and *Move HQ…* to a new machine (§13) the same way, with hq and its
 * default site — and a Fleet Console beside them, this one perhaps — in place of a site. A fleet admin — or the site's machine admin, with
 * `site schedule move --at` — gets a one-time code; the new machine connects with it and a fleet admin confirms its
 * fingerprint as for any machine. Then, signed and in this order: the new machine is armed to receive the site, and
 * starts none of its own; hq lets the two machines pass the one transfer between them; the old machine is asked to
 * move the site now, or at the set time as a scheduled change. Each machine says, sealed, how it went. When the new
 * one says the site answers hq from there, hq is told which machine carries the site, the old machine removes the copy
 * it kept, and it leaves the fleet. If the move does not complete, the old machine has the site running again by then,
 * and the move reads so.
 *
 * Kept in the state folder, since a move may be set days ahead. A move still waiting for its new machine when the
 * Fleet Console restarts has lost its code (codes live in memory) and reads so. One whose code runs out, or whose
 * machine is refused, ends by itself the same way: nothing was asked of either machine yet, so the site runs on.
 */
import { randomUUID } from 'node:crypto'
import { BRANDING, isTransferId, type HostRequest, type MoveReport, type MoveState as HostMoveState } from '@agenthix/core'
import type { PinnedHost } from '../state/hosts'
import { ACTIVE, MoveError, type FleetAdmin, type Move, type MovesDeps, type Where } from './types'
import { endedMoveTo, failedText, leaveTargetEmpty, moveToConnected } from './target'
import { nowRunsOn } from '../join/names'

export { MoveError, type Move, type MoveState, type MovesDeps } from './types'

const FILE = 'moves.json'
const ONLINE_WAIT_MS = 5 * 60_000
const ADDRESS = /^https?:\/\/[^/\s]+$/
/** hq keeps a transfer open this long past the move's time; the Fleet Console opens it again on reconnecting. */
const TRANSFER_OPEN_MS = 24 * 60 * 60_000

export class Moves {
  private moves: Move[]

  constructor(private readonly deps: MovesDeps, private readonly onlineWaitMs = ONLINE_WAIT_MS) {
    const stored = deps.state.readJson(FILE) as { moves?: Move[] } | null
    this.moves = Array.isArray(stored?.moves) ? stored.moves : []
    for (const m of this.moves) {
      if (m.state === 'waitingForMachine' || m.state === 'arranging') {
        m.state = 'failed'
        m.problem = m.joinId
          ? 'The Fleet Console restarted before the new machine was set up, so its code no longer works. Start the move again.'
          : 'The Fleet Console restarted before the new machine was set up. Start the move again.'
      }
    }
    this.save()
    deps.joins.whenMoveConfirmed((joinId, fingerprint, by) => this.confirmed(joinId, fingerprint, by))
    deps.commands.onMove((from, message) => {
      this.heard(from, message).catch(err => console.error('[console] a move report failed:', err instanceof Error ? err.message : err))
    })
    deps.link.on('state', state => {
      if (state === 'connected') void this.reopen()
    })
  }

  list(): Move[] {
    this.settle()
    return [...this.moves]
  }

  get(moveId: string): Move | null {
    this.settle()
    return this.moves.find(m => m.moveId === moveId) ?? null
  }

  /** The active move a machine takes part in, to show on the fleet: *Waiting to receive office*. */
  of(fingerprint: string): Move | null {
    this.settle()
    return this.moves.find(m => ACTIVE.includes(m.state) && (m.from === fingerprint || m.to === fingerprint)) ?? null
  }

  /** The last move a machine took part in, sending or receiving, under way or over. */
  lastOf(fingerprint: string): Move | null {
    this.settle()
    return this.moves.filter(m => m.from === fingerprint || m.to === fingerprint).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  }

  /** The last move to a machine, when it ended without happening (target.ts). */
  endedTo(fingerprint: string): Move | null {
    this.settle()
    return endedMoveTo(this.moves, fingerprint)
  }

  /** *Move site…*: the code for the new machine. `by` null: the site's machine admin asked. */
  /** `notify`: whether the fleet admins are told when the new machine stops answering (hosts/silence.ts). */
  async start(by: FleetAdmin | null, from: string, at: string | null, notify = true): Promise<Move & { code: string; expiresAt: string }> {
    return this.open(by, this.movable(from), at, {}, notify)
  }

  private movable(from: string): PinnedHost {
    const host = this.deps.hosts.byFingerprint(from)
    if (!host) throw new MoveError(404, 'That machine is not connected to this Fleet Console.')
    if (host.hqMachine) throw new MoveError(409, "HQ's site moves with HQ, with Move HQ….")
    if (!host.executionSiteId) throw new MoveError(409, `${host.machineName} carries no site HQ has accepted yet.`)
    return host
  }

  /** *Move site…* to a machine already connected here with no site: no code, set up at once (target.ts). */
  async startTo(by: FleetAdmin, from: string, to: string, at: string | null): Promise<Move> {
    const move = moveToConnected(this.deps, by, this.movable(from), to, at, fp => this.of(fp) !== null)
    this.moves.push(move)
    this.save()
    void this.setUp(move, by)
    return { ...move }
  }

  /**
   * *Move HQ…* to a new machine (spec §13): the code for it. Only from the machine this Fleet Console itself marked as
   * carrying hq (`hqMachine`), never one hq names. `by` null: the machine admin of hq's machine asked.
   */
  async startHq(by: FleetAdmin | null, at: string | null, hqAddress: string | null, asker?: string): Promise<Move & { code: string; expiresAt: string }> {
    const host = this.deps.hosts.list().find(h => h.hqMachine === true)
    if (!host) throw new MoveError(409, "No machine in this fleet is known here as HQ's: HQ cannot be moved from this Fleet Console.")
    if (asker !== undefined && asker !== host.fingerprint) throw new MoveError(409, "Only HQ's own machine asks to move HQ.")
    if (hqAddress !== null && !ADDRESS.test(hqAddress)) throw new MoveError(409, "HQ's new address is a scheme and a host, perhaps with a port: http://192.168.1.30:4100.")
    return this.open(by, host, at, { kind: 'hq', hqAddress })
  }

  private async open(by: FleetAdmin | null, host: PinnedHost, at: string | null, hq: Pick<Move, 'kind' | 'hqAddress'>, notify = true): Promise<Move & { code: string; expiresAt: string }> {
    const from = host.fingerprint
    if (this.of(from)) throw new MoveError(409, `${hq.kind ? 'HQ' : host.siteName} is already moving.`)
    if (at !== null && !(Date.parse(at) > Date.now())) throw new MoveError(409, 'That time has passed; choose a later one.')
    const { joinId, code, expiresAt } = await this.deps.joins.openMove(by, hq.kind ? null : host.executionSiteId, host.siteName, notify)
    const move: Move = {
      ...hq, moveId: randomUUID(), from, siteName: host.siteName, executionSiteId: host.executionSiteId, joinId, codeExpiresAt: expiresAt, to: null,
      transferId: null, at, by: by ? { userId: by.userId, name: by.name } : null, confirmedBy: null, changeId: null,
      state: 'waitingForMachine', reports: { from: null, to: null }, problem: null, createdAt: new Date().toISOString(),
    }
    this.moves.push(move)
    this.save()
    const timer = setTimeout(() => this.settle(), Math.max(0, Date.parse(expiresAt) - Date.now()) + 1_000)
    timer.unref?.()
    return { ...move, code, expiresAt }
  }

  /**
   * A move still waiting for its new machine ends, as not done, once its code can no longer bring one: it ran out,
   * or the machine that used it was refused or turned away. Nothing was asked of either machine yet.
   */
  private settle(): void {
    for (const move of this.moves) {
      if (move.state !== 'waitingForMachine') continue
      const join = move.joinId ? this.deps.joins.get(move.joinId) : null
      const ranOut = move.codeExpiresAt !== undefined && Date.parse(move.codeExpiresAt) <= Date.now()
      const reason = join?.state === 'failed'
        ? lowerFirst(join.problem ?? 'the machine that used its code was turned away')
        : !join || ((join.state === 'waiting' || join.state === 'confirming') && ranOut)
          ? ranOut ? 'the code ran out before a new machine connected with it' : 'its code was refused or withdrawn before a new machine was confirmed'
          : null
      if (reason) this.fail(move, reason).catch(err => console.error('[console] ending a move failed:', err instanceof Error ? err.message : err))
    }
  }

  /** Before it runs: the code withdrawn, or the scheduled change cancelled on the old machine. */
  async cancel(moveId: string, by: FleetAdmin): Promise<Move> {
    const move = this.get(moveId)
    if (!move || !ACTIVE.includes(move.state)) throw new MoveError(404, 'No such move under way.')
    if (move.state === 'waitingForMachine') {
      // Cancelled before the code is withdrawn, so the move is not read meanwhile as ended by a missing code.
      this.set(move, { state: 'cancelled' })
      if (move.joinId) await this.deps.joins.cancel(move.joinId).catch(() => {})
      return move
    }
    if (move.state === 'scheduled' && move.changeId) {
      const r = await this.deps.commands.send(move.from, { op: 'schedule.cancel', changeId: move.changeId }, by)
      if (!r.ok) throw new MoveError(409, r.refusal.message)
    } else throw new MoveError(409, 'The move is running; it can no longer be cancelled.')
    await this.endTransfer(move, `${by.name} cancelled the move.`)
    this.set(move, { state: 'cancelled' })
    leaveTargetEmpty(this.deps.hosts, move)
    return move
  }

  /**
   * The move ends before it began: the machine armed to receive it is told why, sealed, so it stops waiting and says
   * so; then hq drops the transfer, which also ends that wait should the word not reach it.
   */
  private async endTransfer(move: Move, reason: string): Promise<void> {
    if (!move.transferId) return
    if (move.to && this.deps.hosts.byFingerprint(move.to)) {
      await this.deps.commands.tell(move.to, { kind: 'moveEnded', transferId: move.transferId, reason: reason.slice(0, 500) }).catch(() => {})
    }
    await this.deps.link.call('transfer.close', { transferId: move.transferId }).catch(() => {})
  }

  /** The new machine was confirmed: armed, the transfer opened, the old machine asked. */
  private async confirmed(joinId: string, to: string, by: FleetAdmin): Promise<void> {
    const move = this.moves.find(m => m.joinId === joinId && m.state === 'waitingForMachine')
    if (!move) return
    this.set(move, { to, confirmedBy: { userId: by.userId, name: by.name }, state: 'arranging' })
    await this.setUp(move, by)
  }

  private async setUp(move: Move, by: FleetAdmin): Promise<void> {
    try {
      await this.arrange(move, by)
    } catch (err) {
      await this.fail(move, err instanceof Error ? err.message : String(err)).catch(e => console.error('[console] ending a move failed:', e instanceof Error ? e.message : e))
    }
  }

  private async arrange(move: Move, by: FleetAdmin): Promise<void> {
    const from = this.deps.hosts.byFingerprint(move.from)
    const to = move.to ? this.deps.hosts.byFingerprint(move.to) : null
    if (!from || !to) throw new Error('One of the two machines is no longer connected to this Fleet Console.')
    if (!(await this.deps.presence.waitOnline(to.fingerprint, this.onlineWaitMs))) {
      throw new Error(`${to.machineName} has not connected to HQ yet. Check \`${BRANDING.cliCommand} status\` on that machine.`)
    }
    const transferId = randomUUID()
    this.set(move, { transferId })
    const target = move.kind === 'hq' ? 'hq' : 'site'
    const address = move.kind === 'hq' && move.hqAddress ? { hqAddress: move.hqAddress } : {}
    const armed = await this.deps.commands.send(to.fingerprint, {
      op: 'move', role: 'receive', target, peer: from.fingerprint, peerIdentity: from.identity, peerName: from.machineName,
      transferId, siteName: move.siteName, ...address,
    }, by)
    if (!armed.ok) throw new Error(armed.refusal.message)
    await this.openTransfer(move)
    const send: Extract<HostRequest, { op: 'move' }> = {
      op: 'move', role: 'send', target, peer: to.fingerprint, peerIdentity: to.identity, peerName: to.machineName, transferId, ...address,
    }
    // A time that has passed, or is a moment away, runs now; the old machine runs either as a scheduled change.
    const later = move.at !== null && Date.parse(move.at) > Date.now() + 60_000
    // hq's move is written down as asked before the old machine is: a Fleet Console beside hq goes with hq's backup,
    // and the one restored on the new machine must read the move as under way.
    if (move.kind === 'hq') this.set(move, { state: later ? 'scheduled' : 'running' })
    const asked = later ? await this.deps.commands.send(from.fingerprint, { op: 'schedule', at: move.at!, change: send }, by) : await this.deps.commands.send(from.fingerprint, send, by)
    if (!asked.ok) throw new Error(asked.refusal.message)
    const changeId = asked.op === 'schedule' ? (asked.result as { change?: { id?: string } }).change?.id ?? null : null
    this.set(move, { state: later ? 'scheduled' : 'running', changeId })
    const what = move.kind === 'hq' ? 'HQ' : move.siteName
    await this.deps.activity.record(by.userId, move.kind === 'hq' ? 'hq.moveScheduled' : 'site.moveScheduled', `${what} to ${to.machineName}${later ? `, at ${move.at}` : ', now'}`, true)
  }

  private async openTransfer(move: Move): Promise<void> {
    const from = this.deps.hosts.byFingerprint(move.from)
    const to = move.to ? this.deps.hosts.byFingerprint(move.to) : null
    if (!from || !to || !move.transferId) return
    const start = move.at ? Math.max(Date.parse(move.at), Date.now()) : Date.now()
    const { opened } = await this.deps.link.call('transfer.open', {
      transferId: move.transferId, fromHostId: from.hostId, toHostId: to.hostId, expiresAt: new Date(start + TRANSFER_OPEN_MS).toISOString(),
    })
    if (!opened) throw new Error('HQ would not open the transfer between the two machines.')
  }

  /** hq forgets open transfers when it restarts: each move still ahead is opened again. */
  private async reopen(): Promise<void> {
    for (const move of this.moves.filter(m => m.state === 'scheduled' || m.state === 'running')) {
      await this.openTransfer(move).catch(() => {})
    }
  }

  private async heard(from: string, message: Record<string, unknown>): Promise<void> {
    if (message.kind === 'moveCodeAsk') return this.askedByMachine(from, message)
    const report = message.report as Partial<MoveReport> | undefined
    if (!report || !isTransferId(report.transferId) || typeof report.state !== 'string') return
    const move = this.moves.find(m => m.transferId === report.transferId)
    // Only the two machines of the move speak for it, each for its own side.
    if (!move || (from !== move.from && from !== move.to)) return
    const side = from === move.from ? 'from' : 'to'
    const state = report.state as HostMoveState
    this.set(move, { reports: { ...move.reports, [side]: state } })
    const reason = typeof report.reason === 'string' ? report.reason : 'the new machine did not take over.'
    // The new machine gave up first; the old one now says the site runs there again.
    if (move.state === 'failed' && side === 'from' && state === 'rolledBack' && !move.kind) return this.set(move, { problem: failedText(this.deps.hosts, move, reason, 'again') })
    if (!ACTIVE.includes(move.state)) return
    if (side === 'to' && state === 'tookOver') return this.finish(move)
    if ((side === 'from' && state === 'rolledBack') || (side === 'to' && state === 'failed')) return this.fail(move, reason, side === 'from' ? 'again' : 'starting')
    if (move.state === 'scheduled' && (state === 'started' || state === 'transferring')) this.set(move, { state: 'running' })
  }

  /**
   * The site answers hq from the new machine, and the old one committed: hq records where it runs — and names it after
   * the new machine, as every site is — the old machine removes the copy it kept — the move's last step, not an
   * erase — and leaves the fleet.
   */
  async finish(move: Move): Promise<void> {
    const from = this.deps.hosts.byFingerprint(move.from)
    const to = move.to ? this.deps.hosts.byFingerprint(move.to) : null
    const by = move.confirmedBy ? { kind: 'fleetAdmin' as const, ...move.confirmedBy } : null
    if (!to || !by) return this.fail(move, 'the new machine is no longer connected to this Fleet Console.')
    this.set(move, { state: 'finishing', problem: null })
    const hq = move.kind === 'hq'
    try {
      if (hq) {
        // The new machine said, sealed, that hq answers there and the old one committed: by this Fleet Console's own
        // record of the move, it carries hq now, and the old machine no longer does.
        this.deps.hosts.markHqMachine(to.fingerprint)
        this.deps.hosts.update(to.fingerprint, { siteName: to.machineName })
      } else {
        await this.deps.link.call('site.move', { executionSiteId: move.executionSiteId!, toHostId: to.hostId })
        this.deps.hosts.update(to.fingerprint, { executionSiteId: move.executionSiteId, siteName: to.machineName })
      }
      if (from) {
        this.deps.hosts.update(from.fingerprint, { executionSiteId: null })
        const removed = await this.deps.commands.send(from.fingerprint, { op: 'remove', target: hq ? 'hq' : 'site' }, by)
        if (!removed.ok) throw new Error(removed.refusal.message)
        await this.deps.link.call('host.disconnect', { hostId: from.hostId })
        this.deps.hosts.remove(from.fingerprint)
      }
    } catch (err) {
      // It runs on the new machine; only the tidying is left, and finishing again carries it on.
      this.set(move, { problem: `${hq ? 'HQ' : 'The site'} runs on ${to.machineName}, but the old copy is not removed yet: ${err instanceof Error ? err.message : String(err)}` })
      return
    }
    this.set(move, { state: 'done' })
    const moved = hq ? `HQ now runs on ${to.machineName}, and its site is named ${to.machineName}` : nowRunsOn(move.siteName, to.machineName)
    await this.deps.activity.record(by.userId, hq ? 'hq.moved' : 'site.moved', `${moved}${from ? '; the machine it ran on left the fleet' : ''}`, true)
  }

  private async fail(move: Move, reason: string, where: Where = 'still'): Promise<void> {
    const what = move.kind === 'hq' ? 'HQ' : move.siteName
    this.set(move, { state: 'failed', problem: failedText(this.deps.hosts, move, reason, where) })
    leaveTargetEmpty(this.deps.hosts, move)
    await this.endTransfer(move, reason)
    await this.deps.activity.record(move.confirmedBy?.userId ?? move.by?.userId ?? null, move.kind === 'hq' ? 'hq.moveFailed' : 'site.moveFailed', `${what}: ${reason}`, true)
  }

  /** `site schedule move --at` on the site's machine: the code, sealed back to it, so hq never sees it. */
  private async askedByMachine(from: string, message: Record<string, unknown>): Promise<void> {
    if (typeof message.askId !== 'string' || message.askId.length > 64) return
    const at = typeof message.at === 'string' ? message.at : null
    const replyTo = message.askId
    try {
      const m = message.target === 'hq'
        ? await this.startHq(null, at, typeof message.hqAddress === 'string' ? message.hqAddress : null, from)
        : await this.start(null, from, at)
      await this.deps.commands.tell(from, { kind: 'moveCode', replyTo, code: m.code, expiresAt: m.expiresAt, problem: null })
    } catch (err) {
      await this.deps.commands.tell(from, { kind: 'moveCode', replyTo, code: null, expiresAt: null, problem: err instanceof Error ? err.message : 'No code was made.' }).catch(() => {})
    }
  }

  private set(move: Move, patch: Partial<Move>): void {
    Object.assign(move, patch)
    this.save()
  }

  private save(): void {
    this.deps.state.writeJson([FILE], { moves: this.moves })
  }
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
