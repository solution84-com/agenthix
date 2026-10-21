import { describe, expect, it } from 'vitest'
import { floor } from '../floor'
import { scheduler } from '../scheduler'
import type { VoiceEventBody } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { playing, rig, silence, stopped } from './setup'

const decision = (answer: 'READY' | 'KEEP_LISTENING' | 'UNCERTAIN') =>
  ({ kind: 'semantics.decision', answer, confidence: 0.9, silenceMs: 500, by: 'model' }) as const
const saying = (text: string) => ({ kind: 'stt.utterance', text }) as const

/** The scheduler with the floor beside it, as they run together. */
function setup() {
  const r = rig([floor, scheduler], ['orchestration.send'])
  const sends = () => r.of('orchestration.send').map(e => ({ text: e.text, append: e.append }))
  return { ...r, sends }
}

describe('the response scheduler', () => {
  it('sends what the person said when the turn is READY, and not before', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying('what is the weather'))
    s.at(800, silence(true))
    s.at(1_300, decision('KEEP_LISTENING'))
    s.at(1_400, decision('UNCERTAIN'))
    expect(s.sends()).toEqual([])
    s.at(2_800, decision('READY'))
    expect(s.sends()).toEqual([{ text: 'what is the weather', append: false }])
  })

  it('sends nothing on READY when nothing was said', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(500, silence(true))
    s.at(1_000, decision('READY'))
    expect(s.sends()).toEqual([])
  })

  it('adds the words to the same message when the person speaks again before the reply is heard', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying('I think we should'))
    s.at(700, silence(true))
    s.at(1_200, decision('READY'))
    s.at(1_500, silence(false))
    s.at(1_600, saying('move the launch'))
    s.at(2_300, silence(true))
    s.at(2_800, decision('READY'))
    expect(s.sends()).toEqual([
      { text: 'I think we should', append: false },
      { text: 'move the launch', append: true },
    ])
  })

  it('sends a new message once the reply has been heard', () => {
    const s = setup()
    s.at(0, saying('first'))
    s.at(500, decision('READY'))
    s.at(1_000, playing('r1'))
    s.at(3_000, stopped('r1', true))
    s.at(3_500, silence(false))
    s.at(3_600, saying('second'))
    s.at(4_200, silence(true))
    s.at(4_700, decision('READY'))
    expect(s.sends()).toEqual([{ text: 'first', append: false }, { text: 'second', append: false }])
  })

  it('sends a new message when the reply ended with nothing spoken', () => {
    const s = setup()
    s.at(0, saying('first'))
    s.at(500, decision('READY'))
    s.at(1_000, { kind: 'reply.spoken', replyId: 'r1', sentences: 0 })
    s.at(1_500, silence(false))
    s.at(1_600, saying('second'))
    s.at(2_200, silence(true))
    s.at(2_700, decision('READY'))
    expect(s.sends().map(m => m.append)).toEqual([false, false])
  })

  it('leaves words heard over the reply to barge-in', () => {
    const s = setup()
    s.at(0, saying('first'))
    s.at(500, decision('READY'))
    s.at(1_000, playing('r1'))
    s.at(1_200, saying('yeah'))
    s.at(1_900, decision('READY'))
    expect(s.sends()).toEqual([{ text: 'first', append: false }])
  })

  it('does not send an invitation to a raised hand as a message', () => {
    const s = setup()
    s.at(0, { kind: 'orchestration.handRaise', updateId: 'u1', state: 'raised', critical: false })
    s.at(500, silence(false))
    s.at(600, saying('Go ahead.'))
    s.at(1_000, silence(true))
    s.at(1_500, decision('READY'))
    expect(s.sends()).toEqual([])
  })
})

describe('the response scheduler, when the person’s voice was missed', () => {
  it('sends words left with no pause timed once they have not changed for the pause cap', () => {
    const s = setup()
    s.at(0, saying('first'))
    s.at(500, decision('READY'))
    // Taken for the filler phrase's echo, their voice never reached the floor: no pause, no READY.
    s.at(1_000, saying('no, that was wrong'))
    s.tickTo(1_000 + VOICE_SETTINGS.pause.capMs - 50)
    expect(s.sends()).toEqual([{ text: 'first', append: false }])
    s.tickTo(1_000 + VOICE_SETTINGS.pause.capMs + 50)
    expect(s.sends()).toEqual([{ text: 'first', append: false }, { text: 'no, that was wrong', append: true }])
  })

  it('never while the person is heard speaking', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying('a long thought'))
    s.tickTo(100 + VOICE_SETTINGS.pause.capMs * 2)
    expect(s.sends()).toEqual([])
  })
})

describe('the response scheduler, when STT is behind the person', () => {
  const words = (endAt: number, committed = false): VoiceEventBody =>
    ({ kind: 'stt.words', text: 'x', words: [{ text: 'x', startAt: endAt - 200, endAt }], committed, order: 0 })
  function behind() {
    const r = rig([floor, scheduler], ['orchestration.send', 'stt.endTurn'], VOICE_SETTINGS)
    return { ...r, sends: () => r.of('orchestration.send').map(e => e.text), asked: () => r.of('stt.endTurn').length }
  }

  it('waits at READY for the words that reach the end of the speech, and sends them with the rest', () => {
    const s = behind()
    s.at(0, silence(false))
    s.at(600, words(600))
    s.at(600, saying('book the'))
    s.at(1_500, silence(true))
    s.at(2_000, decision('READY'))
    expect(s.sends()).toEqual([])
    s.at(2_400, words(1_450, true))
    s.at(2_400, saying('book the meeting room'))
    expect(s.sends()).toEqual(['book the meeting room'])
  })

  it('sends what it has once STT’s lag and a grace have passed with no more words', () => {
    const s = behind()
    s.at(0, silence(false))
    s.at(300, { kind: 'stt.lag', lagMs: 500, queuedMs: 0 })
    s.at(600, words(600))
    s.at(600, saying('book the'))
    s.at(1_500, silence(true))
    s.at(2_000, decision('READY'))
    s.tickTo(2_000 + 500 + VOICE_SETTINGS.inbound.catchUpGraceMs - 50)
    expect(s.sends()).toEqual([])
    s.tickTo(2_000 + 500 + VOICE_SETTINGS.inbound.catchUpGraceMs + 50)
    expect(s.sends()).toEqual(['book the'])
  })

  it('sends nothing while the person goes on speaking, and the whole at the next READY', () => {
    const s = behind()
    s.at(0, silence(false))
    s.at(600, words(600))
    s.at(600, saying('book the'))
    s.at(1_000, silence(true))
    s.at(1_500, decision('READY'))
    s.at(1_700, silence(false))
    s.tickTo(4_000)
    expect(s.sends()).toEqual([])
    s.at(4_000, words(3_960, true))
    s.at(4_000, saying('book the meeting room'))
    s.at(4_000, silence(true))
    s.at(4_500, decision('READY'))
    expect(s.sends()).toEqual(['book the meeting room'])
  })

  it('does not take a word just before the end of the voice for the last one', () => {
    const s = behind()
    s.at(0, silence(false))
    s.at(1_000, silence(true))
    s.at(1_500, decision('READY'))
    // "…the lazy dog or" ends 130 ms before the voice; "not" follows with no gap.
    s.at(2_000, words(870))
    s.at(2_000, saying('the lazy dog or'))
    expect(s.sends()).toEqual([])
    s.at(2_130, words(950, true))
    s.at(2_130, saying('the lazy dog or not'))
    expect(s.sends()).toEqual(['the lazy dog or not'])
  })

  it('does not take STT ending its turn before the last word for the end of the speech', () => {
    const s = behind()
    s.at(0, silence(false))
    s.at(1_000, silence(true))
    s.at(1_500, decision('READY'))
    // STT closed "…the lazy dog or" as a turn; "not" comes in the next one.
    s.at(2_000, { ...words(850), committed: true } as VoiceEventBody)
    s.at(2_000, saying('the lazy dog or'))
    expect(s.sends()).toEqual([])
    s.at(2_200, words(960, true))
    s.at(2_200, saying('the lazy dog or not'))
    expect(s.sends()).toEqual(['the lazy dog or not'])
  })

  it('asks STT to finish a turn it has not, and sends its final words: a word still being heard is not the last', () => {
    const s = behind()
    s.at(0, silence(false))
    // Silence detection lost the soft end of "dokie": the voice ends at 1 000, the word at 1 300.
    s.at(1_000, silence(true))
    s.at(1_400, words(1_100))
    s.at(1_400, saying('now say okie do'))
    s.at(1_500, decision('READY'))
    expect(s.sends()).toEqual([])
    expect(s.asked()).toBe(1)
    s.at(1_600, words(1_300))
    s.at(1_600, saying('now say okie dokie'))
    expect(s.sends()).toEqual([])
    s.at(1_700, words(1_300, true))
    s.at(1_700, saying('Now say okie dokie.'))
    expect(s.sends()).toEqual(['Now say okie dokie.'])
    expect(s.asked()).toBe(1)
  })

  it('sends at once when STT has already finished the turn', () => {
    const s = behind()
    s.at(0, silence(false))
    s.at(1_000, silence(true))
    s.at(1_400, words(980, true))
    s.at(1_400, saying('Book the room.'))
    s.at(1_500, decision('READY'))
    expect(s.sends()).toEqual(['Book the room.'])
    expect(s.asked()).toBe(0)
  })
})
