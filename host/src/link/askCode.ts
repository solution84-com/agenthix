/**
 * `agenthix hq console-code` on HQ's machine when the Fleet Console runs on another machine (host-management spec §7):
 * this machine is one of its pinned machines, so it asks it for a handover code in an envelope it signs and seals to
 * the Fleet Console it pins, and the code comes back sealed to this machine alone. HQ relays both and reads neither.
 * The Fleet Console answers only the pinned machine that carries hq. An answer counts only when it opened against the
 * pin (envelopes.ts) and names this ask; whatever goes wrong, nothing is made in its place — HQ's own code would
 * leave every machine behind.
 */
import { randomUUID } from 'node:crypto'
import {
  formatFingerprint, formatJoinCode, consoleCodeKind, normalizeJoinCode, type HostEnvelope, type RelayUndeliverableReason,
} from '@agenthix/core'
import { sealEnvelope, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import type { HandoverCode } from './consoleMove'
import { readPin } from './pin'

const ANSWER_WITHIN_MS = 60_000

type Waiting = { consoleFingerprint: string; envelopeId: string | null; settle: (r: HandoverCode) => void }

const waiting = new Map<string, Waiting>()

export type AskDeps = {
  state: StateFolder
  keys: () => Promise<HostKeys>
  link: { connected: () => boolean; sendEnvelope: (envelope: HostEnvelope) => void } | undefined
  timeoutMs?: number
}

/** Asks the pinned Fleet Console, running elsewhere, for a handover code. */
export async function askHandoverCode(d: AskDeps): Promise<HandoverCode> {
  const pin = readPin(d.state)
  if (!pin) return { ok: false, error: 'This machine is not managed by a Fleet Console.' }
  const elsewhere = `the Fleet Console this machine is managed by (its fingerprint ${formatFingerprint(pin.consoleFingerprint)})`
  if (!d.link?.connected()) return { ok: false, error: `This machine is not connected to HQ just now, so it cannot reach ${elsewhere}. Nothing was made.` }
  const askId = randomUUID()
  const answer = new Promise<HandoverCode>(resolve => {
    const timer = setTimeout(() => settle({ ok: false, error: `No answer from ${elsewhere}. Nothing was made.` }), d.timeoutMs ?? ANSWER_WITHIN_MS)
    timer.unref?.()
    const settle = (r: HandoverCode) => {
      clearTimeout(timer)
      waiting.delete(askId)
      resolve(r)
    }
    waiting.set(askId, { consoleFingerprint: pin.consoleFingerprint, envelopeId: null, settle })
  })
  const envelope = await sealEnvelope({ sender: await d.keys(), recipient: pin.console, message: { kind: 'handoverCodeAsk', askId } })
  const w = waiting.get(askId)
  if (w) w.envelopeId = envelope.id
  d.link.sendEnvelope(envelope)
  return answer
}

/** An answer opened against the pin (envelopes.ts): settles the ask it names, if it went to that Fleet Console. */
export function deliverHandoverCode(from: string, message: { replyTo?: unknown; answer?: unknown }): void {
  const w = typeof message.replyTo === 'string' ? waiting.get(message.replyTo) : undefined
  if (!w || w.consoleFingerprint !== from) return
  const a = message.answer as { ok?: unknown; code?: unknown; expiresAt?: unknown; problem?: unknown } | null
  if (a?.ok === true && typeof a.code === 'string' && typeof a.expiresAt === 'string') {
    const code = normalizeJoinCode(a.code)
    // A handover code is marked as one (core's consoleCodeKind); anything else would not hand the machines over.
    if (code && consoleCodeKind(code) === 'handover') return w.settle({ ok: true, code: formatJoinCode(code), expiresAt: a.expiresAt })
    return w.settle({ ok: false, error: 'The Fleet Console answered with something that is not a handover code. Nothing was made.' })
  }
  const problem = a?.ok === false && typeof a.problem === 'string' && a.problem.length <= 500 ? a.problem : 'The Fleet Console made no code.'
  w.settle({ ok: false, error: problem })
}

/** HQ could not pass the ask on. */
export function handoverCodeUndeliverable(envelopeId: string, reason: RelayUndeliverableReason): void {
  for (const w of waiting.values()) {
    if (w.envelopeId !== envelopeId) continue
    const why = reason === 'recipient_offline' ? 'is not connected to HQ just now' : `could not be reached through HQ (${reason})`
    w.settle({ ok: false, error: `The Fleet Console this machine is managed by ${why}. It must be running and connected to hand its machines over. Nothing was made.` })
  }
}
