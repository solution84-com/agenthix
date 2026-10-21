/**
 * What an envelope on Cloud's link may do (pre-release spec B2). In order, and nothing skipped:
 *
 * 1. It is opened against the one Cloud identity this machine pinned when it enrolled, and nobody else: core's
 *    `openEnvelope` checks it is for this machine, its times, the signature, and that its id is new (replay). Anything
 *    else is dropped, and logged by its reason only, never its content.
 * 2. A request is dispatched as Cloud's (`dispatch.ts`), recorded as `by: { kind: 'cloud' }` whatever it claims.
 * 3. The answer goes back sealed to the same Cloud identity, if it is still the one pinned. After the figures, so do
 *    the scheduled-change notices the machine holds, as for a Fleet Console.
 */
import type { CloudResult, EnvelopeRefusal, HostEnvelope, SealedMessage } from '@agenthix/core'
import { fingerprintOf, openEnvelope, sealEnvelope, type EnvelopeReplayGuard, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { readCloudBinding } from '../link/cloudController'
import { heldNotices } from '../scheduled/notices'

export type CloudEnvelopeDeps = {
  state: StateFolder
  keys: () => Promise<HostKeys>
  replay: EnvelopeReplayGuard
  operate: (request: unknown) => Promise<CloudResult>
  send: (envelope: HostEnvelope) => void
  now: () => number
  log: (line: string) => void
}

const REQUEST_ID = /^[^\u0000-\u001f\u007f]{1,128}$/

/**
 * Handles one `relay.envelope` from Cloud's link, and says whether it was a fresh envelope from the pinned Cloud
 * identity — what the link waits for before it does anything. Never throws. A request is answered in the background,
 * so a long one does not hold up the envelopes after it.
 */
export function cloudEnvelopeHandler(d: CloudEnvelopeDeps): (data: unknown) => Promise<boolean> {
  const reply = async (pinnedFp: string, message: SealedMessage) => {
    const now = readCloudBinding(d.state)
    if (!now || (await fingerprintOf(now.identity)) !== pinnedFp) return
    try {
      d.send(await sealEnvelope({ sender: await d.keys(), recipient: now.identity, message, now: d.now() }))
    } catch {
      if (message.kind === 'result') {
        const result: CloudResult = { ok: false, op: message.result.op, refusal: { code: 'failed', message: 'The answer is too large to send.' } }
        d.send(await sealEnvelope({ sender: await d.keys(), recipient: now.identity, message: { kind: 'result', replyTo: message.replyTo, result }, now: d.now() }))
      }
    }
  }

  const answer = async (fp: string, requestId: string, request: unknown) => {
    const result = await d.operate(request)
    await reply(fp, { kind: 'result', replyTo: requestId, result })
    if (result.ok && result.op === 'figures.read') {
      for (const notice of heldNotices(d.state)) await reply(fp, { kind: 'scheduledChange', notice })
    }
  }

  return async data => {
    try {
      const binding = readCloudBinding(d.state)
      if (!binding) {
        d.log('An envelope on Cloud\'s link was dropped: this machine is not enrolled with Agenthix Cloud.')
        return false
      }
      const cloudFp = await fingerprintOf(binding.identity)
      const opened = await openEnvelope(data, {
        recipient: await d.keys(),
        pinned: fp => (fp === cloudFp ? binding.identity : null),
        replay: d.replay,
        now: d.now(),
      })
      if (!opened.ok) {
        d.log(`An envelope on Cloud's link was dropped: ${opened.reason}.`)
        const from = (data as { from?: unknown } | null)?.from
        // Told back only to the pinned identity, sealed; a sender nobody pinned is told nothing.
        if (from === cloudFp && opened.envelopeId) await reply(cloudFp, refused(opened.envelopeId, opened.reason))
        return false
      }
      const message = opened.message as { kind?: unknown; requestId?: unknown; request?: unknown } | null
      if (message?.kind === 'request' && typeof message.requestId === 'string' && REQUEST_ID.test(message.requestId)) {
        const requestId = message.requestId
        void answer(cloudFp, requestId, message.request).catch(err =>
          d.log(`A request from Cloud could not be answered: ${err instanceof Error ? err.message : String(err)}`))
      }
      return true
    } catch (err) {
      d.log(`An envelope on Cloud's link could not be handled: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }
}

const refused = (envelopeId: string, reason: EnvelopeRefusal): SealedMessage => ({ kind: 'refused', envelopeId, reason })
