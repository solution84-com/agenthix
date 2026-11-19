/**
 * Tone in the browser (spec §Tone): the voice hint from the voice profile, told to hq with the Tone switch as the page
 * event `voiceTone`; with Tone off, no hint and `on: false`, so hq speaks everything calm.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { fakeClock } from '../../clock'
import type { VoiceEventBody } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { hqBackchannel } from '../../adapters/hqBackchannel'
import type { LooseSocket } from '../../adapters/hqSocket'
import { KEEPING_UP, rig } from '../../orchestration/__tests__/setup'
import { voiceHint } from '../voiceHint'
import { hintOf } from '../voiceProfile'

const LISTENING: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const reading = (emotion: [string, number] | null, style: [string, number] | null = null): VoiceEventBody => ({
  kind: 'tone.voice', final: false,
  emotion: emotion ? [{ label: emotion[0], confidence: emotion[1] }] : [],
  style: style ? [{ label: style[0], confidence: style[1] }] : [],
})

describe('the voice hint from a reading @SC-2234', () => {
  it('the vocal style first where hq offers it, else the emotion; calm, neutral and anger give none', () => {
    expect(hintOf({ emotion: [{ label: 'happy', confidence: 0.7 }], style: [{ label: 'laughing', confidence: 0.8 }] }, 0.6)).toBe('laughing')
    expect(hintOf({ emotion: [{ label: 'sad', confidence: 0.7 }], style: [{ label: 'normal', confidence: 0.9 }] }, 0.6)).toBe('sad')
    expect(hintOf({ emotion: [{ label: 'sad', confidence: 0.5 }], style: [] }, 0.6)).toBeNull()
    expect(hintOf({ emotion: [{ label: 'angry', confidence: 0.9 }], style: [{ label: 'shouting', confidence: 0.9 }] }, 0.6)).toBeNull()
    expect(hintOf({ emotion: [{ label: 'neutral', confidence: 0.9 }], style: [] }, 0.6)).toBeNull()
  })
})

describe('the voiceHint component @SC-2234', () => {
  function setup(settings: VoiceSettings = LISTENING) {
    const r = rig([voiceHint], ['tone.hint'], settings)
    let t = 0
    const say = (...bodies: VoiceEventBody[]) => { for (const b of bodies) r.at(t += 100, b) }
    return { ...r, say, hints: () => r.out.map(e => (e.kind === 'tone.hint' ? e.hint : 'x')) }
  }

  it('says each change once; a reading at no label clears it', () => {
    const s = setup()
    s.say(reading(['sad', 0.7]), reading(['sad', 0.8]), reading(['happy', 0.9]), reading(['happy', 0.3]))
    expect(s.hints()).toEqual(['sad', 'happy', null])
  })

  it('ignores a reading taken while the agent\'s audio plays', () => {
    const s = setup()
    s.say({ kind: 'phrase.at', text: 'Mm-hm.', playing: true }, reading(['sad', 0.9]), { kind: 'phrase.at', text: 'Mm-hm.', playing: false }, reading(['happy', 0.9]))
    expect(s.hints()).toEqual(['happy'])
  })

  it('with Tone off, none', () => {
    const settings: VoiceSettings = { ...LISTENING, tone: { ...LISTENING.tone, on: false } }
    const s = setup(settings)
    s.say(reading(['sad', 0.9]))
    expect(s.hints()).toEqual([])
  })
})

describe('Tone told to hq (`voiceTone`) @SC-2234', () => {
  function sent(settings: VoiceSettings) {
    const emitted: Array<[string, unknown]> = []
    const socket: LooseSocket = { on: () => undefined, off: () => undefined, emit: (event, payload) => { emitted.push([event, payload]) } }
    const runtime = createVoiceRuntime({ components: [], settings, clock: fakeClock(), adapters: [hqBackchannel({ socket, conversationId: () => 'c1' })] })
    runtime.start()
    return { emitted, runtime }
  }

  it('the switch and the hint, as the hint changes and before a question when the switch changed; the hint goes before the question', () => {
    const settings: VoiceSettings = { ...VOICE_SETTINGS, voiceListener: true, adaptiveVoice: true, tone: { ...VOICE_SETTINGS.tone } }
    const { emitted, runtime } = sent(settings)
    runtime.publish({ kind: 'listen.ask', call: 1, moment: 'soundsFinished', text: 'so', quietMs: 500, t: 0 })
    runtime.publish({ kind: 'tone.hint', hint: 'sad', t: 1 })
    runtime.publish({ kind: 'hum.ask', call: 1, text: 'my dog', skipped: 0, t: 2 })
    settings.tone.on = false
    runtime.publish({ kind: 'hum.ask', call: 2, text: 'my dog died', skipped: 0, t: 3 })
    expect(emitted.map(([e, p]) => [e, e === VP.voiceTone ? p : (p as { seq: number }).seq])).toEqual([
      [VP.voiceTone, { conversationId: 'c1', on: true }],
      [VP.voiceTone, { conversationId: 'c1', on: true, hint: 'sad' }],
      [VP.backchannel, 1],
      [VP.voiceTone, { conversationId: 'c1', on: false }],
      [VP.backchannel, 2],
    ])
  })

  it('off with the light model not listening (Adaptive voice off)', () => {
    const { emitted, runtime } = sent({ ...VOICE_SETTINGS, voiceListener: true, adaptiveVoice: false })
    runtime.publish({ kind: 'hum.ask', call: 1, text: 'hi', skipped: 0, t: 0 })
    expect(emitted[0]).toEqual([VP.voiceTone, { conversationId: 'c1', on: false }])
  })
})
