/**
 * The listening runtime's trigger (adaptive voice listening, spec §The light model → *When it is asked*, §When a turn
 * ends): when the light model is asked, and what an answer does to the person's turn. Run with the floor and the
 * scheduler beside it, as in a voice session.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { scheduler } from '../../orchestration/scheduler'
import { KEEPING_UP, playing, rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { listenerTrigger } from '../trigger'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const saying = (text: string) => ({ kind: 'stt.utterance', text }) as const
const ready = { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' } as const
type Answer = Omit<Extract<VoiceEventBody, { kind: 'listen.answer' }>, 'kind'>
const answer = (a: Partial<Answer> & { call: number }): VoiceEventBody =>
  ({ kind: 'listen.answer', action: 'keep_listening', nextCheckSecs: 2, ...a })

function setup(settings: VoiceSettings = LIGHT) {
  const r = rig([floor, scheduler, listenerTrigger], ['listen.ask', 'listen.play', 'listen.drop', 'listen.turn', 'listen.sendPlain', 'orchestration.send', 'orchestration.floor'], settings)
  const asks = () => r.of('listen.ask').map(({ call, moment, text, keptOpen, workingMs }) =>
    ({ call, moment, text, ...(keptOpen ? { keptOpen } : {}), ...(workingMs !== undefined ? { workingMs } : {}) }))
  const sends = () => r.of('orchestration.send').map(({ text, append, via, trailedOff }) => ({ text, append, ...(via ? { via } : {}), ...(trailedOff ? { trailedOff } : {}) }))
  /** The person says `text` from `at` and goes quiet 700 ms later, the words on screen at once. */
  const says = (at: number, text: string) => { r.at(at, silence(false)); r.at(at + 100, saying(text)); r.at(at + 700, silence(true)) }
  return { ...r, asks, sends, says }
}

describe('when the light model is asked @SC-2230', () => {
  it('never asks while they talk: a pause in their words asks nothing, only the sound model ending the turn does @SC-2198', () => {
    const s = setup()
    s.says(0, 'so I was wondering')
    s.tickTo(2_900)
    expect(s.asks()).toEqual([])
    s.at(3_000, ready)
    expect(s.asks()).toEqual([{ call: 1, moment: 'soundsFinished', text: 'so I was wondering' }])
  })

  it('does not ask while the person is speaking @SC-2198', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying('still going'))
    s.tickTo(3_000)
    expect(s.asks()).toEqual([])
  })

  it('sounds finished is always a fresh call that carries the message, which goes no other way', () => {
    const s = setup()
    s.says(0, 'what is the weather in Melbourne')
    s.at(750, ready)
    expect(s.asks()).toEqual([{ call: 1, moment: 'soundsFinished', text: 'what is the weather in Melbourne' }])
    expect(s.sends()).toEqual([{ text: 'what is the weather in Melbourne', append: false, via: 'listen' }])
    s.tickTo(1_500)
    // The words went with the call: no quiet-after-words call about them.
    expect(s.asks()).toHaveLength(1)
  })

  it('asks again at the light model\'s own next check while the person stays quiet, and their speaking cancels it', () => {
    const s = setup()
    s.says(0, 'so I was wondering')
    s.at(750, ready)
    s.at(1_400, answer({ call: 1, nextCheckSecs: 5 }))
    s.tickTo(6_350)
    expect(s.asks()).toHaveLength(1)
    s.tickTo(6_400)
    expect(s.asks()[1]).toEqual({ call: 2, moment: 'quiet', text: 'so I was wondering', keptOpen: true })
    expect(s.of('listen.ask')[1]!.quietMs).toBe(5_700)
    s.at(7_000, answer({ call: 2, nextCheckSecs: 3 }))
    s.at(8_000, silence(false))
    s.tickTo(12_000)
    expect(s.asks()).toHaveLength(2)
  })

  it('holds next check to 1–30 s, and takes 2 s when it is missing', () => {
    const s = setup()
    s.says(0, 'hmm')
    s.at(750, ready)
    s.at(1_000, answer({ call: 1, nextCheckSecs: 0.1 }))
    s.tickTo(1_950)
    expect(s.asks()).toHaveLength(1)
    s.tickTo(2_000)
    expect(s.asks()).toHaveLength(2)
    s.at(2_000, answer({ call: 2, nextCheckSecs: Number.NaN }))
    s.tickTo(4_000)
    expect(s.asks()).toHaveLength(3)
    s.at(4_000, answer({ call: 3, nextCheckSecs: 600 }))
    s.tickTo(33_950)
    expect(s.asks()).toHaveLength(3)
    s.tickTo(34_000)
    expect(s.asks()).toHaveLength(4)
  })

  it('never asks while the reply plays @SC-2198', () => {
    const s = setup()
    s.at(0, playing('t1'))
    s.at(100, saying('mm-hm'))
    s.tickTo(3_000)
    expect(s.asks()).toEqual([])
  })
})

describe('the sounds finished answer, as the browser sees it @SC-2230', () => {
  function finished() {
    const s = setup()
    s.says(0, 'what is the weather in Melbourne')
    s.at(750, ready)
    return s
  }

  it('closed: the turn is over, and nothing more is asked about it', () => {
    const s = finished()
    s.at(1_500, answer({ call: 1, action: 'close_turn', say: "You're welcome.", lineId: 'L1', turn: 'closed', turnId: 't9' }))
    expect(s.of('listen.turn')).toMatchObject([{ state: 'closed' }])
    expect(s.of('listen.play')).toMatchObject([{ lineId: 'L1', quiet: false }])
    expect(s.of('orchestration.floor').at(-1)?.state).not.toBe('agent-thinking')
    s.tickTo(20_000)
    expect(s.asks()).toHaveLength(1)
  })

  it('handed over: the hold plays, and the wait is checked at next check until the reply\'s first sentence plays @SC-2213', () => {
    const s = finished()
    s.at(1_500, answer({ call: 1, action: 'hand_over', say: 'Let me check the forecast.', lineId: 'L1', turn: 'handedOver', nextCheckSecs: 4 }))
    expect(s.of('listen.turn')).toMatchObject([{ state: 'handedOver' }])
    expect(s.of('listen.play')).toMatchObject([{ lineId: 'L1', quiet: false }])
    s.tickTo(5_500)
    expect(s.asks()[1]).toEqual({ call: 2, moment: 'working', text: '', workingMs: 4_000 })
    s.at(6_000, answer({ call: 2, action: 'acknowledge', say: 'Nearly there.', lineId: 'L2', nextCheckSecs: 3 }))
    expect(s.of('listen.play').at(-1)).toMatchObject({ lineId: 'L2', quiet: true })
    s.at(7_000, playing('t2'))
    s.tickTo(20_000)
    expect(s.asks()).toHaveLength(2)
  })

  it('handed over: the checks stop once the reply\'s first sentence is here, though it waits for the hold to end @SC-2213', () => {
    const s = finished()
    s.at(1_500, answer({ call: 1, action: 'hand_over', say: 'Let me check the forecast.', lineId: 'L1', turn: 'handedOver', nextCheckSecs: 2 }))
    s.tickTo(3_600)
    expect(s.asks().map(a => a.moment)).toEqual(['soundsFinished', 'working'])
    // A check in flight answers after the sentence came: no chain starts again.
    s.at(3_700, { kind: 'reply.sentence', replyId: 't2', index: 0, text: 'It will be sunny.' })
    s.at(4_000, answer({ call: 2, action: 'keep_listening', nextCheckSecs: 2 }))
    s.tickTo(20_000)
    expect(s.asks()).toHaveLength(2)
  })

  it('handed over: words that join the message after the sentence came start the checks again, for the reply that answers again @SC-2212 @SC-2213', () => {
    const s = finished()
    s.at(1_500, answer({ call: 1, action: 'hand_over', say: 'Let me check.', lineId: 'L1', turn: 'handedOver', nextCheckSecs: 2 }))
    s.at(1_800, { kind: 'reply.sentence', replyId: 't2', index: 0, text: 'It will be sunny.' })
    s.says(2_000, 'and in Sydney')
    s.tickTo(3_200)
    s.at(3_250, ready)
    expect(s.sends().at(-1)).toEqual({ text: 'and in Sydney', append: true })
    s.tickTo(6_000)
    expect(s.asks().map(a => a.moment)).toEqual(['soundsFinished', 'working'])
  })

  it('not yet: the turn stays open, re-checked as kept open, and the person\'s next words join it @SC-2205', () => {
    const s = finished()
    s.at(1_500, answer({ call: 1, action: 'keep_listening', nextCheckSecs: 2 }))
    expect(s.of('listen.turn')).toMatchObject([{ state: 'notYet' }])
    expect(s.of('orchestration.floor').at(-1)?.state).toBe('open')
    s.tickTo(3_500)
    expect(s.asks()[1]).toEqual({ call: 2, moment: 'quiet', text: 'what is the weather in Melbourne', keptOpen: true })
    s.at(3_800, answer({ call: 2, nextCheckSecs: 10 }))
    s.says(4_000, 'and Sydney')
    // Their words ask nothing; the next sounds finished call carries them all.
    s.tickTo(5_000)
    expect(s.asks()).toHaveLength(2)
    s.at(5_100, ready)
    expect(s.asks()[2]).toEqual({ call: 3, moment: 'soundsFinished', text: 'what is the weather in Melbourne and Sydney' })
    expect(s.sends().filter(x => !x.via)).toEqual([])
  })

  it('not yet: after new words, the quiet is checked again from the schedule\'s first check, carrying them @SC-2205', () => {
    const s = finished()
    // The first check comes at 1.8 s of quiet: 0.8 s had passed when the answer came, then hq's 1 s wait.
    s.at(1_500, answer({ call: 1, action: 'keep_listening', nextCheckSecs: 1 }))
    s.tickTo(2_500)
    s.at(2_800, answer({ call: 2, nextCheckSecs: 10 }))
    s.says(4_000, 'and Sydney')
    s.tickTo(6_450)
    expect(s.asks()).toHaveLength(2)
    s.tickTo(6_500)
    expect(s.asks()[2]).toEqual({ call: 3, moment: 'quiet', text: 'what is the weather in Melbourne and Sydney', keptOpen: true })
    expect(s.of('listen.ask')[2]!.quietMs).toBe(1_800)
  })

  it('the fallback: handed over, and its stored phrase plays @SC-2211', () => {
    const s = finished()
    s.at(2_800, answer({ call: 1, turn: 'fallback', say: 'Okay, bear with me.', lineId: 'S1' }))
    expect(s.of('listen.turn')).toMatchObject([{ state: 'handedOver' }])
    expect(s.of('listen.play')).toMatchObject([{ lineId: 'S1' }])
  })

  it('a kept-open re-check may end the turn @SC-2207', () => {
    const s = finished()
    s.at(1_500, answer({ call: 1 }))
    s.tickTo(3_500)
    s.at(3_600, answer({ call: 2, action: 'hand_over', say: 'Right, let me look.', lineId: 'L2', turn: 'handedOver' }))
    expect(s.of('listen.turn').map(e => e.state)).toEqual(['notYet', 'handedOver'])
  })

  it('no answer at all: the words go as a plain message, and the rest of the voice is plain', () => {
    const s = finished()
    s.tickTo(LIGHT.listener.noAnswerMs + 800)
    expect(s.of('listen.sendPlain')).toMatchObject([{ text: 'what is the weather in Melbourne' }])
    s.says(20_000, 'thanks')
    s.at(20_750, ready)
    expect(s.asks()).toHaveLength(1)
    expect(s.sends().at(-1)).toEqual({ text: 'thanks', append: true })
  })
})

describe('late and stale answers @SC-2207 @SC-2230', () => {
  it('a superseded answer plays nothing, and decides nothing: the person spoke after its call, so its line is dropped @SC-2229', () => {
    const s = setup()
    s.says(0, 'so')
    s.at(750, ready)
    // They went on within a second of each send: false finishes, so each READY needs more quiet (1.0 s, then 1.5 s).
    s.says(1_100, 'so I was thinking')
    s.tickTo(2_800)
    s.at(2_800, ready)
    s.says(3_200, 'about the trip')
    s.tickTo(5_400)
    s.at(5_400, ready)
    s.at(5_450, answer({ call: 1, action: 'acknowledge', say: 'Right.', lineId: 'L1', nextCheckSecs: 1 }))
    s.at(5_460, answer({ call: 2, action: 'invite', say: 'Go on.', lineId: 'L0' }))
    expect(s.of('listen.play')).toEqual([])
    expect(s.of('listen.drop')).toEqual([expect.objectContaining({ lineId: 'L1', call: 1, why: 'you spoke again' })])
    expect(s.of('listen.turn')).toEqual([])
    expect(s.asks().map(a => a.moment)).toEqual(['soundsFinished', 'soundsFinished', 'soundsFinished'])
  })

  it('an answer that comes twice is read once: its line is allowed once (the double hum)', () => {
    const s = setup()
    s.says(0, 'so I went to the falls')
    s.at(750, ready)
    s.at(1_500, answer({ call: 1, action: 'acknowledge', say: 'Right.', lineId: 'L1', nextCheckSecs: 2 }))
    s.at(1_520, answer({ call: 1, action: 'acknowledge', say: 'Right.', lineId: 'L1', nextCheckSecs: 2 }))
    expect(s.of('listen.play')).toHaveLength(1)
    expect(s.of('listen.turn')).toHaveLength(1)
  })

  it('the person speaking again supersedes the sounds finished call, and its words are carried to the next', () => {
    const s = setup()
    s.says(0, 'tell me about the weather')
    s.at(750, ready)
    s.says(1_000, 'in Melbourne')
    s.tickTo(2_700)
    s.at(2_700, ready)
    expect(s.asks()[1]).toEqual({ call: 2, moment: 'soundsFinished', text: 'tell me about the weather in Melbourne' })
    s.at(2_800, answer({ call: 1, action: 'hand_over', say: 'Let me look.', lineId: 'L1', turn: 'handedOver' }))
    expect(s.of('listen.turn')).toEqual([])
  })

  it('words that come after the call without the person speaking again do not supersede it', () => {
    const s = setup()
    s.says(0, 'tell me about the weather')
    s.at(750, ready)
    s.at(900, saying('weather'))
    s.tickTo(2_000)
    expect(s.asks()).toHaveLength(1)
  })
})

describe('the person going on after a hand over @SC-2212 @SC-2230', () => {
  it('their words join the message as today\'s continue, not as a new call', () => {
    const s = setup()
    s.says(0, 'what is the weather')
    s.at(750, ready)
    s.at(1_500, answer({ call: 1, action: 'hand_over', say: 'Let me check.', lineId: 'L1', turn: 'handedOver', nextCheckSecs: 10 }))
    s.says(2_000, 'in Melbourne')
    s.tickTo(3_000)
    s.at(3_050, ready)
    expect(s.sends().at(-1)).toEqual({ text: 'in Melbourne', append: true })
    expect(s.asks()).toHaveLength(1)
  })
})

describe('plain voice @SC-2218 @SC-2230', () => {
  it('the flag on with Adaptive voice off: nothing is asked, and the message goes as today, never trailed off', () => {
    const s = setup({ ...LIGHT, adaptiveVoice: false })
    s.says(0, 'what is the weather')
    s.tickTo(700)
    s.at(3_700, { ...ready, silenceMs: 3_000, confidence: 0.1 })
    s.tickTo(10_000)
    expect(s.asks()).toEqual([])
    expect(s.sends()).toEqual([{ text: 'what is the weather', append: false }])
  })

  it('an answer with off: plain voice from then on; a message it carried was taken', () => {
    const s = setup()
    s.says(0, 'what is the weather')
    s.at(750, ready)
    s.at(900, answer({ call: 1, off: true, turn: 'handedOver' }))
    expect(s.of('listen.turn')).toMatchObject([{ state: 'handedOver' }])
    expect(s.of('listen.sendPlain')).toEqual([])
    s.says(10_000, 'thanks')
    s.tickTo(10_700)
    s.at(10_750, ready)
    expect(s.asks()).toHaveLength(1)
    expect(s.sends().at(-1)).toEqual({ text: 'thanks', append: true })
  })

  it('off while a turn is kept open: its words, which hq did not take, go as a plain message', () => {
    const s = setup()
    s.says(0, 'so the thing is')
    s.at(750, ready)
    s.at(900, answer({ call: 1 }))
    s.tickTo(3_000)
    s.at(3_100, answer({ call: 2, off: true }))
    expect(s.of('listen.sendPlain')).toMatchObject([{ text: 'so the thing is' }])
  })

  it('the flag off: inert, and today\'s scheduler sends @SC-2219', () => {
    const s = setup({ ...KEEPING_UP, voiceListener: false })
    s.says(0, 'what is the weather')
    s.at(750, ready)
    s.tickTo(5_000)
    expect(s.asks()).toEqual([])
    expect(s.sends()).toEqual([{ text: 'what is the weather', append: false }])
  })
})
