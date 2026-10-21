import { describe, expect, it } from 'vitest'
import { floor } from '../floor'
import { activeListening } from '../activeListening'
import { VOICE_SETTINGS } from '../../settings'
import { rig, silence } from './setup'

const L = { ...VOICE_SETTINGS.activeListening, afterMs: VOICE_SETTINGS.encouragement.afterMs }
const decision = (answer: 'READY' | 'KEEP_LISTENING' | 'UNCERTAIN') =>
  ({ kind: 'semantics.decision', answer, confidence: 0.1, silenceMs: 1_000, by: 'model' }) as const
const stop = (by: 'stop-word' | 'words' | 'tap') => ({ kind: 'orchestration.playback', action: 'stop', replyId: 'r1', by }) as const
const saying = (text: string) => ({ kind: 'stt.utterance', text }) as const

function setup() {
  const r = rig([floor, activeListening], ['orchestration.phrase'])
  return { ...r, phrases: () => r.of('orchestration.phrase').map(e => e.phrase) }
}

/** The person speaks from `from` to `to`, then pauses, and the rule answers at 1 s of the pause. */
function speakThenPause(s: ReturnType<typeof setup>, from: number, to: number, answer: Parameters<typeof decision>[0]) {
  s.at(from, silence(false))
  s.at(to, silence(true))
  s.at(to + 1_000, decision(answer))
}

describe('active listening', () => {
  it('says an active listening phrase in a pause where the person is mid-thought, once they have talked a while', () => {
    const s = setup()
    speakThenPause(s, 0, 3_000, 'KEEP_LISTENING')
    expect(s.phrases()).toEqual([])
    speakThenPause(s, 4_200, L.afterSpeechMs + 500, 'KEEP_LISTENING')
    expect(s.phrases()).toEqual(['active-listening'])
  })

  it('makes none where the turn may be ending', () => {
    const s = setup()
    speakThenPause(s, 0, L.afterSpeechMs + 500, 'UNCERTAIN')
    s.at(L.afterSpeechMs + 2_500, decision('READY'))
    expect(s.phrases()).toEqual([])
  })

  it('makes one a pause, and none closer than the gap to the last', () => {
    const s = setup()
    const first = L.afterSpeechMs + 500
    speakThenPause(s, 0, first, 'KEEP_LISTENING')
    s.at(first + 2_000, decision('KEEP_LISTENING'))
    speakThenPause(s, first + 2_500, first + 4_000, 'KEEP_LISTENING')
    expect(s.phrases()).toEqual(['active-listening'])
    speakThenPause(s, first + 5_000, first + L.gapMs + 500, 'KEEP_LISTENING')
    expect(s.phrases()).toEqual(['active-listening', 'active-listening'])
  })

  it('counts the talking from the start of the message', () => {
    const s = setup()
    speakThenPause(s, 0, 5_000, 'KEEP_LISTENING')
    s.at(6_100, { kind: 'orchestration.send', text: 'first', append: false })
    speakThenPause(s, 7_000, 7_000 + L.afterSpeechMs - 1_000, 'KEEP_LISTENING')
    expect(s.phrases()).toEqual([])
  })

  it('encourages the person who stopped it with a stop word, once they stay silent', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(400, silence(true))
    s.at(600, stop('stop-word'))
    s.at(650, saying('wait'))
    s.tickTo(600 + L.afterMs - 50)
    expect(s.phrases()).toEqual([])
    s.tickTo(600 + L.afterMs + 100)
    expect(s.phrases()).toEqual(['encouragement'])
    s.tickTo(5_000)
    expect(s.phrases()).toEqual(['encouragement'])
  })

  it('waits for the stop word to end before counting the silence', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(300, stop('stop-word'))
    s.at(800, silence(true))
    s.tickTo(800 + L.afterMs - 50)
    expect(s.phrases()).toEqual([])
    s.tickTo(800 + L.afterMs + 100)
    expect(s.phrases()).toEqual(['encouragement'])
  })

  it('says nothing when the person goes on, says more than the stop word, or stopped it another way', () => {
    const on = setup()
    on.at(400, silence(true))
    on.at(600, stop('stop-word'))
    on.at(900, silence(false))
    on.tickTo(3_000)
    const more = setup()
    more.at(400, silence(true))
    more.at(600, stop('stop-word'))
    more.at(700, saying('wait, I meant Tuesday'))
    more.tickTo(3_000)
    const tapped = setup()
    tapped.at(400, silence(true))
    tapped.at(600, stop('tap'))
    tapped.tickTo(3_000)
    const words = setup()
    words.at(400, silence(true))
    words.at(600, stop('words'))
    words.tickTo(3_000)
    expect([on.phrases(), more.phrases(), tapped.phrases(), words.phrases()]).toEqual([[], [], [], []])
  })
})
