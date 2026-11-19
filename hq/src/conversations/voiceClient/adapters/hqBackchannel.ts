/**
 * The backchannel's side of hq's socket (adaptive voice listening, spec §The backchannel): each question the listening
 * read asks (`hum.ask`) goes out as `backchannel`, and each answer (`backchannelKind`) comes in as `hum.answer`; each
 * kind and tone the keeper asks for (`hum.speak`) goes out as `backchannelSpeak` (the library's sounds come back to the
 * speaker, as `backchannelSound`): voice events of hq's own pages only (`CONVERSATION_VOICE_PAGE_SOCKET`). Tone goes out as
 * `voiceTone` (spec §Tone): its switch, and with it on the voice hint (`tone.hint`), as the hint changes and before a
 * question to the light model or the listening read when either changed since; hq takes Tone as off until it is told.
 */
import {
  CONVERSATION_VOICE_PAGE_SOCKET as VP, VOICE_HUM_KINDS, type VoiceBackchannelKindEvent, type VoiceBackchannelPayload,
  type VoiceBackchannelSpeakPayload, type VoiceHint, type VoiceTonePayload,
} from '@agenthix/core'
import { toneOn } from '../tone/settings'
import { isHumTone } from '../backchannel/kinds'
import type { Adapter } from '../runtime/types'
import type { HqListeningDeps } from './hqListening'

const FAILED: ReadonlySet<unknown> = new Set(['off', 'timeout', 'failed'])

export function hqBackchannel(deps: HqListeningDeps): Adapter {
  return {
    name: 'hqBackchannel',
    start(runtime) {
      const answered = (e: VoiceBackchannelKindEvent) => {
        if (e.conversationId !== deps.conversationId() || typeof e.seq !== 'number') return
        const humKind = (VOICE_HUM_KINDS as readonly unknown[]).includes(e.kind) ? e.kind : null
        runtime.publish({
          kind: 'hum.answer', call: e.seq, humKind, tone: isHumTone(e.tone) ? e.tone : null,
          ms: typeof e.ms === 'number' ? e.ms : 0,
          ...(FAILED.has(e.failed) && { failed: e.failed }), ...(humKind === null && !FAILED.has(e.failed) && { failed: 'failed' as const }),
          t: runtime.now(),
        })
      }
      deps.socket.on(VP.backchannelKind, answered as never)
      let hint: VoiceHint | null = null
      let told = ''
      const tell = () => {
        const conversationId = deps.conversationId()
        if (!conversationId) return
        const on = toneOn(runtime.settings())
        const payload: VoiceTonePayload = { conversationId, on, ...(on && hint && { hint }) }
        const key = JSON.stringify(payload)
        if (key === told) return
        told = key
        deps.socket.emit(VP.voiceTone, payload)
      }
      // As the hint changes, and before each question to either model (ahead of the question itself), so a switch changed in Tuning applies to the next.
      const offTone = runtime.subscribe(['tone.hint', 'listen.ask', 'hum.ask'], e => {
        if (e.kind === 'tone.hint') hint = e.hint
        tell()
      })
      const off = runtime.subscribe(['hum.ask', 'hum.speak'], e => {
        const conversationId = deps.conversationId()
        if (!conversationId) return
        if (e.kind === 'hum.ask') {
          const question: VoiceBackchannelPayload = {
            conversationId, seq: e.call, text: e.text, ...(e.atPause && { atPause: true }), ...(e.recent && { recent: e.recent }),
          }
          deps.socket.emit(VP.backchannel, question)
        } else if (e.kind === 'hum.speak') {
          const ask: VoiceBackchannelSpeakPayload = { conversationId, kind: e.hum, tone: e.tone, ...(e.warm && { warm: true }) }
          deps.socket.emit(VP.backchannelSpeak, ask)
        }
      })
      return () => { deps.socket.off(VP.backchannelKind, answered as never); off(); offTone() }
    },
  }
}
