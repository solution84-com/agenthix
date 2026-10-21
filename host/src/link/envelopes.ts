/**
 * What a controller's envelope may do on this machine (host-management spec §2, §4 C3, §6). In order, and nothing
 * skipped:
 *
 * 1. It is opened with core's cryptography against the one pinned Fleet Console and nobody else — not the Cloud
 *    controller (which reaches the machine on its own link, cloud/), not HQ, not another machine. The opening checks it is
 *    for this machine, its times, the sender's signature, and that its id is new (replay), before decrypting.
 * 2. What it holds must be a request, made on behalf of a named fleet admin: a Fleet Console cannot speak as the
 *    machine admin, Cloud or the maintenance window.
 * 3. The request goes through core's `parseHostRequest` — the closed set and nothing else, so none of the
 *    operations that stay on the machine (the owner socket's) can be asked this way — and then the same dispatch
 *    the CLI's requests of the closed set take.
 * 4. The answer goes back sealed to the same pinned Fleet Console, if it is still the one pinned. After the figures,
 *    so do the scheduled-change notices the machine holds (`scheduled/notices.ts`).
 */
import {
  HOST_OPERATIONS, parseHostRequest, type EnvelopeRefusal, type HostActor, type HostEnvelope, type HostMessage,
  type HostRequest, type HostResult,
} from '@agenthix/core'
import { openEnvelope, sealEnvelope, type EnvelopeReplayGuard, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { readPin, type ConsolePin } from './pin'
import { deliverHandoverCode } from './askCode'
import { isFromCloudController } from './cloudController'
import { heldNotices } from '../scheduled/notices'

export type ControllerOperate = (request: HostRequest, by: HostActor, pin: ConsolePin) => Promise<HostResult>

export type EnvelopeDeps = {
  state: StateFolder
  keys: () => Promise<HostKeys>
  replay: EnvelopeReplayGuard
  operate: ControllerOperate
  send: (envelope: HostEnvelope) => void
  now: () => number
  log?: (line: string) => void
  /**
   * What the pinned Fleet Console sends besides requests: the answer to a move code the machine admin asked for, and
   * why a move this machine was armed for ended before it came.
   */
  onMessage?: (message: Record<string, unknown>) => void
}

const TEXT = /^[^\u0000-\u001f\u007f]{1,256}$/

/** The fleet admin the Fleet Console names; null for anyone else. */
export function fleetAdminActor(v: unknown): HostActor | null {
  const a = v as { kind?: unknown; userId?: unknown; name?: unknown } | null
  if (!a || typeof a !== 'object' || a.kind !== 'fleetAdmin') return null
  if (typeof a.userId !== 'string' || !TEXT.test(a.userId) || typeof a.name !== 'string' || !TEXT.test(a.name)) return null
  return { kind: 'fleetAdmin', userId: a.userId, name: a.name }
}

function opOf(request: unknown): string | null {
  const op = request && typeof request === 'object' ? (request as { op?: unknown }).op : undefined
  return typeof op === 'string' && op.length <= 64 ? op : null
}

const refusedResult = (op: unknown, code: 'malformed' | 'unknown_operation', message: string): HostResult =>
  ({ ok: false, op: (HOST_OPERATIONS as readonly unknown[]).includes(op) ? (op as HostResult['op']) : null, refusal: { code, message } })

/** Handles one `relay.envelope` from HQ. Never throws: whatever goes wrong, nothing acts. */
export function envelopeHandler(d: EnvelopeDeps): (data: unknown) => Promise<void> {
  const reply = async (pin: ConsolePin, message: HostMessage) => {
    // Disconnected, or connected to another Fleet Console, while it ran: the answer is not sent.
    const now = readPin(d.state)
    if (!now || now.consoleFingerprint !== pin.consoleFingerprint) return
    try {
      d.send(await sealEnvelope({ sender: await d.keys(), recipient: now.console, message, now: d.now() }))
    } catch {
      if (message.kind === 'result') {
        const result: HostResult = { ok: false, op: message.result.op, refusal: { code: 'failed', message: 'The answer is too large to send.' } }
        d.send(await sealEnvelope({ sender: await d.keys(), recipient: now.console, message: { kind: 'result', replyTo: message.replyTo, result }, now: d.now() }))
      }
    }
  }

  return async data => {
    try {
      // Cloud reaches this machine on its own link (cloud/), never through HQ.
      if (await isFromCloudController(d.state, data)) {
        d.log?.('An envelope from the Cloud controller came through HQ and was dropped: Cloud reaches this machine only on its own link.')
        return
      }
      const pin = readPin(d.state)
      const opened = await openEnvelope(data, {
        recipient: await d.keys(),
        pinned: fp => (pin && fp === pin.consoleFingerprint ? pin.console : null),
        replay: d.replay,
        now: d.now(),
      })
      if (!opened.ok) {
        d.log?.(`An envelope was refused: ${opened.reason}.`)
        const from = (data as { from?: unknown } | null)?.from
        // Told back only to the pinned Fleet Console, sealed, so HQ cannot make up a refusal either.
        if (pin && from === pin.consoleFingerprint && opened.envelopeId) await reply(pin, refusal(opened.envelopeId, opened.reason))
        return
      }
      // `pinned` gave out only this pin's identity, so the sender is this Fleet Console.
      if (!pin) return
      const message = opened.message as { kind?: unknown; requestId?: unknown; by?: unknown; request?: unknown } | null
      // The answer to `hq console-code`'s ask (askCode.ts): a code, sealed to this machine alone.
      if (message?.kind === 'handoverCode') return deliverHandoverCode(pin.consoleFingerprint, message as Record<string, unknown>)
      if (message?.kind === 'moveCode' || message?.kind === 'moveEnded') return d.onMessage?.(message as Record<string, unknown>)
      if (!message || message.kind !== 'request') return
      if (typeof message.requestId !== 'string' || !TEXT.test(message.requestId) || message.requestId.length > 128) return
      const answer = (result: HostResult) => reply(pin, { kind: 'result', replyTo: message.requestId as string, result })
      const by = fleetAdminActor(message.by)
      if (!by) return answer(refusedResult(opOf(message.request), 'malformed', 'A request must name the fleet admin it is made for.'))
      const parsed = parseHostRequest(message.request)
      if (!parsed.ok) return answer({ ok: false, op: null, refusal: parsed.refusal })
      if (!(HOST_OPERATIONS as readonly string[]).includes(parsed.request.op)) {
        return answer(refusedResult(null, 'unknown_operation', 'The host service does not do that.'))
      }
      // Opening takes a moment; a disconnect in it wins.
      if (readPin(d.state)?.consoleFingerprint !== pin.consoleFingerprint) return
      const result = await d.operate(parsed.request, by, pin)
      await answer(result)
      // The Fleet Console keeps scheduled changes in memory only: each read of the figures is offered them again.
      if (result.ok && result.op === 'figures.read') {
        for (const notice of heldNotices(d.state)) await reply(pin, { kind: 'scheduledChange', notice })
      }
    } catch (err) {
      d.log?.(`An envelope could not be handled: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

const refusal = (envelopeId: string, reason: EnvelopeRefusal): HostMessage => ({ kind: 'refused', envelopeId, reason })
