/**
 * Commands to host services (spec §4 C3, §7). Each is a `HostMessage` request, signed with the console's key and
 * sealed to the host's pinned identity, which hq relays and can only pass or drop. Every envelope that comes back is
 * opened against the pinned identities and the replay guard; one that fails any check is dropped, never acted on.
 * An answer counts only when it comes from the host the request went to, and names the operation that was asked.
 */
import { randomUUID } from 'node:crypto'
import {
  type EnvelopeRefusal, type HostActor, type HostMessage, type HostRequest, type HostResult,
  type RelayUndeliverableReason, isHostFigures, parseHostStopping, parseScheduledChangeNotice,
} from '@agenthix/core'
import { openEnvelope, sealEnvelope, type EnvelopeReplayGuard, type HostKeys } from '@agenthix/core/host-crypto'
import type { HqLink } from '../hq/link'
import type { PinnedHosts } from '../state/hosts'
import type { Presence } from './presence'

/** Operations that take minutes on the machine: their answer is waited for longer. */
const LONG_OPERATIONS = new Set<HostRequest['op']>([
  'install', 'upgrade', 'backup.take', 'backup.export', 'backup.store', 'backup.fetch', 'backup.restore',
  'erase', 'move', 'start', 'stop', 'remove', 'suspend', 'resume', 'frontDoor.set', 'address.set',
])
const ASK_ID = /^[A-Za-z0-9_-]{1,64}$/
const SHORT_TIMEOUT_MS = 60_000
const LONG_TIMEOUT_MS = 20 * 60_000

export class HostCommandError extends Error {
  constructor(readonly code: 'not_pinned' | 'undeliverable' | 'refused_envelope' | 'no_answer', message: string) {
    super(message)
    this.name = 'HostCommandError'
  }
}

type Pending = {
  fingerprint: string
  envelopeId: string
  op: HostRequest['op']
  resolve: (r: HostResult) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type DroppedEnvelope = { reason: EnvelopeRefusal | 'unexpected'; envelopeId: string | null }

export class HostCommands {
  private readonly pending = new Map<string, Pending>()
  /** The last envelopes refused, for the logs and the tests: what was dropped and why. */
  readonly dropped: DroppedEnvelope[] = []
  private readonly handedOver: ((fingerprint: string) => void)[] = []
  private codeAsk: ((fingerprint: string, askId: string) => Promise<void>) | null = null
  /** A site's move: how it goes on each machine, and a machine admin asking for its code (move/moves.ts). */
  private readonly moveListeners: ((fingerprint: string, message: Record<string, unknown>) => void)[] = []
  private readonly stoppingListeners: ((fingerprint: string) => void)[] = []

  constructor(
    private readonly keys: HostKeys,
    private readonly link: HqLink,
    private readonly hosts: PinnedHosts,
    private readonly presence: Presence,
    private readonly replay: EnvelopeReplayGuard,
    private readonly timeouts: { short?: number; long?: number } = {},
  ) {
    link.on('envelope', envelope => {
      this.receive(envelope).catch(err => console.error('[console] envelope handling failed:', err instanceof Error ? err.message : err))
    })
    link.on('undeliverable', (envelopeId, reason) => this.undeliverable(envelopeId, reason))
  }

  /** A machine that pinned this Fleet Console on a handover certificate says so (handover/incoming.ts). */
  onHandedOver(listener: (fingerprint: string) => void): void {
    this.handedOver.push(listener)
  }

  /** A machine it manages asks for a handover code (handover/outgoing.ts decides whether it may). */
  onHandoverCodeAsk(listener: (fingerprint: string, askId: string) => Promise<void>): void {
    this.codeAsk = listener
  }

  onMove(listener: (fingerprint: string, message: Record<string, unknown>) => void): void {
    this.moveListeners.push(listener)
  }

  /** A pinned machine says it stops on purpose (hosts/silence.ts): how its card reads, and never consent to anything. */
  onStopping(listener: (fingerprint: string) => void): void {
    this.stoppingListeners.push(listener)
  }

  /** A message that is not a command — the answer to a machine's own ask — sealed to a pinned host. */
  async tell(fingerprint: string, message: HostMessage): Promise<void> {
    const host = this.hosts.byFingerprint(fingerprint)
    if (!host) throw new HostCommandError('not_pinned', 'That machine is not connected to this Fleet Console.')
    this.link.sendEnvelope(await sealEnvelope({ sender: this.keys, recipient: host.identity, message }))
  }

  async send(fingerprint: string, request: HostRequest, by: HostActor): Promise<HostResult> {
    const host = this.hosts.byFingerprint(fingerprint)
    if (!host) throw new HostCommandError('not_pinned', 'That machine is not connected to this Fleet Console.')
    const requestId = randomUUID()
    const envelope = await sealEnvelope({
      sender: this.keys,
      recipient: host.identity,
      message: { kind: 'request', requestId, by, request },
    })
    const long = LONG_OPERATIONS.has(request.op)
    const timeoutMs = long ? this.timeouts.long ?? LONG_TIMEOUT_MS : this.timeouts.short ?? SHORT_TIMEOUT_MS
    const answer = new Promise<HostResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new HostCommandError('no_answer', `${host.machineName} did not answer in time.`))
      }, timeoutMs)
      this.pending.set(requestId, { fingerprint, envelopeId: envelope.id, op: request.op, resolve, reject, timer })
    })
    try {
      this.link.sendEnvelope(envelope)
    } catch (err) {
      this.settle(requestId)
      throw err
    }
    return answer
  }

  /** An envelope hq relayed to the console. */
  async receive(data: unknown): Promise<void> {
    const opened = await openEnvelope(data, {
      recipient: this.keys,
      pinned: fp => this.hosts.identity(fp),
      replay: this.replay,
    })
    if (!opened.ok) {
      this.drop({ reason: opened.reason, envelopeId: opened.envelopeId })
      return
    }
    const from = opened.fromFingerprint
    const message = opened.message as Record<string, unknown> | null
    switch (message?.kind) {
      case 'result':
        return this.result(from, opened.envelopeId, message.replyTo, message.result)
      case 'refused':
        return this.refused(from, opened.envelopeId, message.envelopeId, message.reason)
      case 'figures':
        if (isHostFigures(message.figures)) this.presence.setFigures(from, message.figures)
        else this.drop({ reason: 'unexpected', envelopeId: opened.envelopeId })
        return
      case 'scheduledChange': {
        const notice = parseScheduledChangeNotice(message.notice)
        if (notice) this.presence.addNotice(from, notice)
        else this.drop({ reason: 'unexpected', envelopeId: opened.envelopeId })
        return
      }
      case 'handedOver':
        for (const listener of this.handedOver) listener(from)
        return
      case 'handoverCodeAsk':
        if (typeof message.askId === 'string' && ASK_ID.test(message.askId) && this.codeAsk) return this.codeAsk(from, message.askId)
        this.drop({ reason: 'unexpected', envelopeId: opened.envelopeId })
        return
      case 'stopping':
        if (parseHostStopping(message)) for (const listener of this.stoppingListeners) listener(from)
        else this.drop({ reason: 'unexpected', envelopeId: opened.envelopeId })
        return
      case 'move':
      case 'moveCodeAsk':
        for (const listener of this.moveListeners) listener(from, message)
        return
      default:
        // A host service never commands the console.
        this.drop({ reason: 'unexpected', envelopeId: opened.envelopeId })
    }
  }

  private result(from: string, envelopeId: string, replyTo: unknown, result: unknown): void {
    const pending = typeof replyTo === 'string' ? this.pending.get(replyTo) : undefined
    if (!pending || pending.fingerprint !== from || !isResultFor(result, pending.op)) {
      this.drop({ reason: 'unexpected', envelopeId })
      return
    }
    this.settle(replyTo as string)
    // Figures are what a controller reads (spec §6): whoever asked, the answer is what the fleet shows.
    if (result.ok && result.op === 'figures.read' && isHostFigures(result.result)) this.presence.setFigures(from, result.result)
    pending.resolve(result)
  }

  private refused(from: string, envelopeId: string, refusedId: unknown, reason: unknown): void {
    const entry = [...this.pending.entries()].find(([, p]) => p.envelopeId === refusedId && p.fingerprint === from)
    if (!entry) {
      this.drop({ reason: 'unexpected', envelopeId })
      return
    }
    this.settle(entry[0])
    entry[1].reject(new HostCommandError('refused_envelope', `The machine refused the command (${String(reason)}).`))
  }

  private undeliverable(envelopeId: string, reason: RelayUndeliverableReason): void {
    const entry = [...this.pending.entries()].find(([, p]) => p.envelopeId === envelopeId)
    if (!entry) return
    this.settle(entry[0])
    const words = reason === 'recipient_offline' ? 'the machine is not connected to HQ right now' : `HQ could not pass it on (${reason})`
    entry[1].reject(new HostCommandError('undeliverable', `The command did not reach the machine: ${words}.`))
  }

  private settle(requestId: string): void {
    const p = this.pending.get(requestId)
    if (p) clearTimeout(p.timer)
    this.pending.delete(requestId)
  }

  private drop(d: DroppedEnvelope): void {
    this.dropped.push(d)
    if (this.dropped.length > 100) this.dropped.shift()
    console.warn(`[console] dropped an envelope (${d.reason})`)
  }
}

function isResultFor(v: unknown, op: HostRequest['op']): v is HostResult {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  if (r.ok === true) return r.op === op && r.result !== undefined
  if (r.ok === false) {
    const refusal = r.refusal as Record<string, unknown> | undefined
    return (r.op === op || r.op === null) && typeof refusal?.code === 'string' && typeof refusal.message === 'string'
  }
  return false
}
