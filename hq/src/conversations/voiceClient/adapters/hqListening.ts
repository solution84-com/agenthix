/**
 * The light model's side of hq's socket (adaptive voice listening): each question the listening runtime asks
 * (`listen.ask`) goes out as `listen`, and each answer (`listened`) comes in as `listen.answer`. The lines themselves
 * (`line`) go to the speaker, from the voice session's room handlers. A `listened` that carries a listening style is
 * the reply's `set_listening_style` (`listen.styleAsked`): it decides nothing else, so it is no answer to a call.
 */
import { CONVERSATION_VOICE_SOCKET as V, VOICE_LISTEN_STYLES, type VoiceListenedEvent } from '@agenthix/core'
import type { Adapter } from '../runtime/types'
import { hqVoice, type LooseSocket } from './hqSocket'

export type HqListeningDeps = { socket: LooseSocket; conversationId: () => string | null }

export function hqListening(deps: HqListeningDeps): Adapter {
  return {
    name: 'hqListening',
    start(runtime) {
      const hq = hqVoice(deps.socket)
      const listened = (e: VoiceListenedEvent) => {
        if (e.conversationId !== deps.conversationId() || typeof e.seq !== 'number') return
        // A style this page does not know is ignored, as a later hq's may be.
        if (e.style !== undefined) {
          if ((VOICE_LISTEN_STYLES as readonly unknown[]).includes(e.style)) runtime.publish({ kind: 'listen.styleAsked', style: e.style, t: runtime.now() })
          if (e.lineId === undefined && e.turn === undefined && e.off !== true && e.say === undefined) return
        }
        runtime.publish({
          kind: 'listen.answer', call: e.seq, action: e.action, nextCheckSecs: e.nextCheckSecs,
          ...(e.say !== undefined && { say: e.say }), ...(e.lineId !== undefined && { lineId: e.lineId }),
          ...(e.turn !== undefined && { turn: e.turn }), ...(e.turnId !== undefined && { turnId: e.turnId }),
          ...(e.off === true && { off: true }), t: runtime.now(),
        })
      }
      deps.socket.on(V.listened, listened as never)
      const off = runtime.subscribe(['listen.ask'], e => {
        const conversationId = deps.conversationId()
        if (e.kind !== 'listen.ask' || !conversationId) return
        hq.listen({
          conversationId, seq: e.call, moment: e.moment, text: e.text, quietMs: Math.round(e.quietMs),
          ...(e.workingMs !== undefined && { workingMs: Math.round(e.workingMs) }), ...(e.keptOpen && { keptOpen: true }),
        })
      })
      return () => { deps.socket.off(V.listened, listened as never); off() }
    },
  }
}
