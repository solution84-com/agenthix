/**
 * The backchannel over scripted timelines of the person's speech and the sound model's verdicts (spec §The
 * backchannel), and the audio rule: while a hum plays everything else waits, and a hum never starts over the agent.
 */
import { describe, expect, it } from 'vitest'
import { createSpeakerSounds } from '../../adapters/speakerSounds'
import { fakePlayback } from '../../__tests__/sessionRig'
import type { VoiceEventInput } from '../../events'
import type { VoiceRuntimeHandle } from '../../runtime/types'
import { ON, setup } from './backchannelRig'

/** A long telling: `stretches` of speech `speakMs` long, with pauses the sound model calls not finished. */
function telling(stretches: number, speakMs: number, pauseMs = 900) {
  const s = setup()
  let t = 0
  for (let i = 0; i < stretches; i++) {
    s.talk(t, t + speakMs, `and then part ${i} of the story`)
    t += speakMs + pauseMs
    s.tickTo(t - 50)
  }
  return s
}

describe('the backchannel over a telling @SC-2226', () => {
  it('a long telling gets a hum about every 4 s or more of speech, each in a pause', () => {
    const s = telling(24, 2_500)
    const hums = s.hums()
    // 60 s of speech: one hum per two 2.5 s stretches (4 s reached on the second), never closer.
    expect(hums).toHaveLength(12)
    for (const h of hums) {
      expect(h.speechMs).toBeGreaterThanOrEqual(4_000)
      expect(h.pausedMs).toBeGreaterThanOrEqual(400)
    }
  })

  it('a short turn gets none', () => {
    const s = telling(1, 3_500)
    expect(s.hums()).toEqual([])
  })

  it('a telling whose every pause the sound model calls finished gets none', () => {
    const s = setup()
    for (let i = 0, t = 0; i < 6; i++, t += 3_900) {
      s.talk(t, t + 2_500, 'and that was it', 'READY')
      s.tickTo(t + 3_850)
    }
    expect(s.hums()).toEqual([])
  })

  it('a hum due over the agent is never asked for', () => {
    const s = setup()
    s.at(0, { kind: 'acoustic.silence', silent: false })
    s.at(9_500, { kind: 'acoustic.silence', silent: true })
    s.at(9_600, { kind: 'playback.at', replyId: 'r', index: 0, elapsedMs: 0, ended: false, playing: true })
    s.tickTo(9_950)
    s.at(10_000, { kind: 'semantics.decision', answer: 'UNCERTAIN', confidence: 0.5, silenceMs: 500, by: 'model' })
    s.tickTo(10_800)
    expect(s.hums()).toEqual([])
  })
})

/** A sound the keeper starts: its key and words, as `backchannel.sound` carries them. */
const due = (key: string, words: string) => ({
  kind: 'backchannel.sound' as const, key, words, hum: 'continuer' as const, tone: 'calm' as const, made: 'new' as const, pausedMs: 500, seq: 0, t: 0,
})

function sounds() {
  const made: ReturnType<typeof fakePlayback>[] = []
  const published: VoiceEventInput[] = []
  const heard: string[] = []
  const reply = { playing: false }
  const runtime = {
    publish: (e: VoiceEventInput) => { published.push(e) }, settings: () => ON, now: () => 0, subscribe: () => () => undefined,
  } as unknown as VoiceRuntimeHandle
  const s = createSpeakerSounds({
    createPlayback: () => { const pb = fakePlayback(); made.push(pb); return pb.playback },
    random: () => 0, runtime: () => runtime, heard: (_, h) => { if (h.playing) heard.push(h.text) }, linePlayed: () => undefined,
    replyPlaying: () => reply.playing, awaitingReply: () => false, floor: () => 'person-pausing',
  })
  const audio = new Int16Array([100, 100]).buffer
  for (const words of ['Mm-hm.', 'Mm.']) s.sound({ conversationId: 'c', words, tone: 'calm', kind: 'continuer', audio }, runtime)
  const played = () => published.flatMap(e => (e.kind === 'backchannel.played' ? [e.text ?? `none: ${e.why}`] : []))
  return { s, made, runtime, played, heard, reply, audio, published }
}

describe('the audio rule @SC-2226', () => {
  it('a sound hq made is kept by its key, the keeper told it is here; one that could not be made, or is not the library\'s, is not', () => {
    const r = sounds()
    r.s.sound({ conversationId: 'c', words: '(laughs)', tone: 'bright', kind: 'amusement', failed: true }, r.runtime)
    r.s.sound({ conversationId: 'c', words: 'Hmm, good question.', tone: 'calm', kind: 'continuer', audio: r.audio }, r.runtime)
    r.s.sound({ conversationId: 'c', words: 'Oh no.', tone: 'gentle', kind: 'sympathy', audio: r.audio, made: 'new' }, r.runtime)
    expect(r.published.filter(e => e.kind === 'hum.sound')).toMatchObject([
      { key: 'mm-hm|calm', words: 'Mm-hm.', tone: 'calm', hum: 'continuer', ok: true, made: 'kept' }, { key: 'mm|calm', ok: true },
      { key: '(laughs)', ok: false }, { key: 'oh no|gentle', ok: true, made: 'new' },
    ])
    r.s.hum(r.runtime, due('mm|calm', 'Mm.'))
    r.made[0]!.state.idle = true
    r.s.tick()
    r.s.hum(r.runtime, due('(laughs)', '(laughs)'))
    expect(r.played()).toEqual(['Mm.', 'none: its audio is not here'])
    expect(r.published.find(e => e.kind === 'backchannel.played')).toMatchObject({ text: 'Mm.', hum: 'continuer', tone: 'calm', made: 'new' })
  })

  it('while a hum plays, a line waits for it to end, and the reply waits too', () => {
    const r = sounds()
    r.s.hum(r.runtime, due('mm-hm|calm', 'Mm-hm.'))
    r.s.line({ conversationId: 'c', lineId: 'L1', text: 'Let me check.', audio: r.audio })
    r.s.allowLine('L1', false)
    r.s.tick()
    expect(r.s.busy()).toBe(true)
    expect(r.heard).toEqual(['Mm-hm.'])
    r.made[0]!.state.idle = true
    r.s.tick()
    expect(r.heard).toEqual(['Mm-hm.', 'Let me check.'])
  })

  it('a hum never starts over a line, a stored phrase or the reply', () => {
    const r = sounds()
    r.s.line({ conversationId: 'c', lineId: 'L1', text: 'Let me check.', audio: r.audio })
    r.s.allowLine('L1', false)
    r.s.hum(r.runtime, due('mm-hm|calm', 'Mm-hm.'))
    r.made[0]!.state.idle = true
    r.s.tick()
    r.reply.playing = true
    r.s.hum(r.runtime, due('mm-hm|calm', 'Mm-hm.'))
    expect(r.played()).toEqual(['none: a line was playing', 'none: a reply was playing'])
  })

  it('the person speaking does not cut a hum off', () => {
    const r = sounds()
    r.s.hum(r.runtime, due('mm-hm|calm', 'Mm-hm.'))
    r.s.personSpeaks()
    r.s.personHolds()
    expect(r.s.busy()).toBe(true)
  })

  it('voice ending forgets every kept sound: nothing outlives the conversation', () => {
    const r = sounds()
    r.s.reset()
    r.s.hum(r.runtime, due('mm-hm|calm', 'Mm-hm.'))
    expect(r.played()).toEqual(['none: its audio is not here'])
  })
})
