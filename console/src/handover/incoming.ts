/**
 * A new Fleet Console taking the running one's place (spec §7; core's join.ts). It was started with a one-time code
 * (`console install <hq address> <code>`) and presents only the code's lookup to hq. With a handover code, it sends
 * its identity and a binding that needs the code; the running Fleet Console answers with its own binding over both
 * fingerprints, which hq cannot make, and the machines it pinned, sealed to this one. Only then are they pinned here,
 * and the certificate they will follow is given to hq, which hands it to them and gives this Fleet Console its
 * credential. With a code hq made itself, the credential comes at once and there is nothing to take over: every
 * machine connects again (`console connect`).
 *
 * The code's first character says which of the two it is (core's `consoleCodeKind`), and nothing here takes hq's word
 * for it. A handover code that hq answers with a credential before any machines came is refused (`notHandedOver`):
 * the move did not happen, and this Fleet Console does not start empty. A fresh code never takes machines from an
 * answer, since hq made that code and could make up an answer that proves it. And the machines are pinned here only
 * once the credential is kept: until hq has it acknowledged, the running Fleet Console keeps them.
 *
 * What happened is kept in the state folder, so `node dist/cli.js handover-status` can tell the host service, which
 * tells the person who ran `console install`: which of the two, and how many machines follow it so far. Each machine
 * says it follows in an envelope sealed to this one, seconds after this one started — inside the time in which a freshly
 * started Fleet Console refuses every envelope as possibly replayed (core's replay.ts) — so those words are opened here
 * with a guard of their own that remembers ids but not the start: replayed, they could only count a machine that once
 * followed this very Fleet Console. Its answer names the key it holds, so a machine it ran on can tell whether it is the
 * one that handed over (the host service's localConsole.ts).
 */
import { formatFingerprint, isFingerprint, consoleCodeKind, type ConsoleCodeKind } from '@agenthix/core'
import {
  EnvelopeReplayGuard, fingerprintOf, isHostIdentity, newConsoleBinding, openEnvelope, verifyHandoverCertificate,
  verifyOldConsoleBinding, type HostKeys,
} from '@agenthix/core/host-crypto'
import type { HqLink } from '../hq/link'
import type { HostCommands } from '../hosts/commands'
import type { StateFolder } from '../state/folder'
import type { PinnedHost, PinnedHosts } from '../state/hosts'

const FILE = 'handover.json'

export type HandoverStatus =
  | { state: 'none' }
  /** Started with a code; hq has not answered yet. */
  | { state: 'waiting' }
  /** The running Fleet Console handed its machines over; `repinned` of `hosts` follow this one so far. */
  | { state: 'handedOver'; from: string; hosts: number; repinned: number }
  /** hq's own code: no Fleet Console was running, so this one starts with no machines. */
  | { state: 'fresh' }
  | { state: 'failed'; problem: string }

type Record_ =
  /** The running Fleet Console's answer checked out; waiting for hq to give and take back the credential. */
  | { state: 'completing'; from: string; hosts: PinnedHost[]; at: string }
  | { state: 'handedOver'; from: string; hosts: string[]; repinned: string[]; at: string }
  | { state: 'fresh'; at: string }
  | { state: 'failed'; problem: string; at: string }

export type HandoverInDeps = {
  keys: HostKeys
  link: HqLink
  hosts: PinnedHosts
  commands: HostCommands
  state: StateFolder
  machineName: string
}

const NOT_PROVEN =
  "The answer that came through HQ did not prove it came from the Fleet Console that made this code, so nothing was taken over. Ask a machine admin of HQ's machine for a new code."
const NOT_MOVED =
  "HQ answered this handover code as if it had made it itself, with no machines, so the move did not happen: this Fleet Console did not start, and the one before keeps the machines. Ask a machine admin of HQ's machine for a new code."
const NOT_FINISHED =
  "HQ did not finish the move, so the Fleet Console before keeps the machines and this one took none. Ask a machine admin of HQ's machine for a new code."

export class HandoverIn {
  private record: Record_ | null
  private readonly kind: ConsoleCodeKind | null
  private own: string | null = null
  /** Machines that said they follow while the move was being made done, before they were pinned here. */
  private readonly early = new Set<string>()
  private readonly followGuard = new EnvelopeReplayGuard(0)

  /** `code`: the one-time code it was started with; null when it holds none. */
  constructor(private readonly deps: HandoverInDeps, private readonly code: string | null) {
    this.record = read(deps.state)
    this.kind = code ? consoleCodeKind(code) : null
    deps.link.on('redeemOpen', () => {
      this.ask().catch(err => console.error('[console] handover ask failed:', err instanceof Error ? err.message : err))
    })
    deps.link.on('handover', frame => {
      this.onAcceptance(frame).catch(err => this.fail(err instanceof Error ? err.message : 'The handover could not be read.'))
    })
    deps.link.on('notHandedOver', () => this.fail(NOT_MOVED))
    deps.link.on('state', state => {
      this.onState(state).catch(err => console.error('[console] handover failed:', err instanceof Error ? err.message : err))
    })
    deps.commands.onHandedOver(fp => this.repinned(fp))
    deps.link.on('envelope', envelope => {
      this.onFollowing(envelope).catch(err => console.error('[console] a machine following could not be read:', err instanceof Error ? err.message : err))
    })
    void fingerprintOf(deps.keys.identity).then(fp => { this.own = fp })
  }

  /** A machine handed over says it follows this Fleet Console now; counted once, whenever this one started. */
  async onFollowing(envelope: unknown): Promise<void> {
    const r = this.record
    const waiting = r?.state === 'completing' ? r.hosts.map(h => h.fingerprint)
      : r?.state === 'handedOver' ? r.hosts.filter(fp => !r.repinned.includes(fp)) : []
    if (!waiting.length) return
    const identities = r?.state === 'completing' ? r.hosts : null
    const opened = await openEnvelope(envelope, {
      recipient: this.deps.keys,
      pinned: fp => (!waiting.includes(fp) ? null : identities?.find(h => h.fingerprint === fp)?.identity ?? this.deps.hosts.identity(fp)),
      replay: this.followGuard,
    })
    if (!opened.ok || (opened.message as { kind?: unknown } | null)?.kind !== 'handedOver') return
    if (this.record?.state === 'completing') this.early.add(opened.fromFingerprint)
    else this.repinned(opened.fromFingerprint)
  }

  private async onState(state: string): Promise<void> {
    const r = this.record
    if (r?.state === 'completing') {
      // hq gave the credential and it is kept: the move is done, and the machines are this Fleet Console's now.
      if (state === 'connected') return this.complete(r)
      if (state === 'refused') return this.fail(NOT_FINISHED)
      return
    }
    if (r || !this.code) return
    if (state === 'connected' && this.kind === 'fresh') this.save({ state: 'fresh', at: new Date().toISOString() })
    else if (state === 'refused') this.fail("HQ refused the code: it is wrong, used or expired. Ask a machine admin of HQ's machine for a new one.")
  }

  private async complete(r: Extract<Record_, { state: 'completing' }>): Promise<void> {
    for (const host of r.hosts) await this.deps.hosts.pin(host)
    const hosts = r.hosts.map(h => h.fingerprint)
    this.save({ state: 'handedOver', from: r.from, hosts, repinned: hosts.filter(fp => this.early.has(fp)), at: new Date().toISOString() })
    this.early.clear()
  }

  /** What happened, and the key this Fleet Console holds (`fingerprint`, unformatted). */
  status(): HandoverStatus & { fingerprint?: string } {
    const own = this.own ? { fingerprint: this.own } : {}
    return { ...this.outcome(), ...own }
  }

  private outcome(): HandoverStatus {
    const r = this.record
    if (!r || r.state === 'completing') return this.code ? { state: 'waiting' } : { state: 'none' }
    if (r.state === 'handedOver') return { state: 'handedOver', from: formatFingerprint(r.from), hosts: r.hosts.length, repinned: r.repinned.length }
    return r.state === 'fresh' ? { state: 'fresh' } : { state: 'failed', problem: r.problem }
  }

  private async ask(): Promise<void> {
    if (!this.code || this.kind !== 'handover' || this.record) return
    const k = this.deps.keys.identity
    this.deps.link.sendHandover('console.handoverAsk', {
      identity: { role: 'console', signingKey: k.signingKey, sealingKey: k.sealingKey },
      machineName: this.deps.machineName,
      binding: await newConsoleBinding(this.code, await fingerprintOf(k)),
    })
  }

  /** The running Fleet Console's answer, through hq. Nothing is kept unless every part of it checks out. */
  async onAcceptance(frame: unknown): Promise<void> {
    if (!this.code || this.kind !== 'handover' || this.record) return
    const f = frame && typeof frame === 'object' ? (frame as Record<string, unknown>) : {}
    if (!isHostIdentity(f.identity) || f.identity.role !== 'console' || typeof f.binding !== 'string') return this.fail(NOT_PROVEN)
    const old = { role: 'console' as const, signingKey: f.identity.signingKey, sealingKey: f.identity.sealingKey }
    const ownFp = await fingerprintOf(this.deps.keys.identity)
    const oldFp = await fingerprintOf(old)
    if (oldFp === ownFp || !(await verifyOldConsoleBinding(this.code, oldFp, ownFp, f.binding))) return this.fail(NOT_PROVEN)

    // The binding proves who the running Fleet Console is; its envelope is opened against that identity alone. A
    // replay guard of its own: this one envelope is opened once, whenever this Fleet Console started.
    const opened = await openEnvelope(f.envelope, {
      recipient: this.deps.keys, pinned: fp => (fp === oldFp ? old : null), replay: new EnvelopeReplayGuard(0),
    })
    if (!opened.ok) return this.fail(NOT_PROVEN)
    const message = opened.message as { kind?: unknown; certificate?: unknown; hosts?: unknown } | null
    if (message?.kind !== 'handoverState') return this.fail(NOT_PROVEN)
    const handed = await verifyHandoverCertificate(message.certificate, old)
    if (!handed || handed.fingerprint !== ownFp) return this.fail(NOT_PROVEN)
    const hosts = await readHosts(message.hosts)
    if (!hosts) return this.fail('The running Fleet Console sent machines that could not be read, so nothing was taken over.')

    this.save({ state: 'completing', from: oldFp, hosts, at: new Date().toISOString() })
    this.deps.link.sendHandover('console.handoverDone', { certificate: message.certificate })
  }

  private repinned(fingerprint: string): void {
    const r = this.record
    if (r?.state !== 'handedOver' || !r.hosts.includes(fingerprint) || r.repinned.includes(fingerprint)) return
    this.save({ ...r, repinned: [...r.repinned, fingerprint] })
  }

  private fail(problem: string): void {
    if (this.record && this.record.state !== 'completing') return
    console.warn(`[console] ${problem}`)
    this.save({ state: 'failed', problem, at: new Date().toISOString() })
  }

  private save(record: Record_): void {
    this.record = record
    this.deps.state.writeJson([FILE], record)
  }
}

async function readHosts(value: unknown): Promise<PinnedHost[] | null> {
  if (!Array.isArray(value) || value.length > 1000) return null
  const hosts: PinnedHost[] = []
  for (const v of value) {
    const h = v as Partial<PinnedHost> | null
    if (!h || typeof h !== 'object' || !isFingerprint(h.fingerprint) || !isHostIdentity(h.identity) || h.identity.role !== 'host') return null
    if ((await fingerprintOf(h.identity)) !== h.fingerprint) return null
    if (typeof h.hostId !== 'string' || typeof h.machineName !== 'string' || typeof h.siteName !== 'string' ||
      typeof h.connectedAt !== 'string' || (h.executionSiteId !== null && typeof h.executionSiteId !== 'string') ||
      (h.connectedBy !== null && typeof h.connectedBy !== 'string')) return null
    hosts.push({
      fingerprint: h.fingerprint, hostId: h.hostId,
      identity: { role: 'host', signingKey: h.identity.signingKey, sealingKey: h.identity.sealingKey },
      machineName: h.machineName, siteName: h.siteName, executionSiteId: h.executionSiteId ?? null,
      connectedAt: h.connectedAt, connectedBy: h.connectedBy ?? null, ...(h.hqMachine === true ? { hqMachine: true } : {}),
      // The machine's setting comes with it; anything but an explicit no is the default, yes.
      ...(h.notifyIfSilent === false ? { notifyIfSilent: false } : {}),
    })
  }
  return hosts
}

function read(state: StateFolder): Record_ | null {
  const r = state.readJson(FILE) as Record_ | null
  return r && (r.state === 'completing' || r.state === 'handedOver' || r.state === 'fresh' || r.state === 'failed') ? r : null
}
