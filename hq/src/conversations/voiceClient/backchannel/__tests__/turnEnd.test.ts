/**
 * The backchannel and the turn's end (the owner's playtest of 18 Nov): a light model's line dropped because they spoke
 * again is no line, so its "not yet" may hum; and nothing hums once the turn is handed over (until the reply plays) or
 * closed (until they speak again): a near miss says why.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { silence } from '../../orchestration/__tests__/setup'
import { answer, finished, setup, verdict } from './backchannelRig'

const TEXT = 'then it got steep and rocky and my friend twisted her ankle.'

/** 5 s of speech, the turn sent at 5.8 s, then they go on 0.1 s later for 0.4 s and pause again. */
function falseFinish(s: ReturnType<typeof setup>) {
  s.at(0, silence(false))
  s.at(100, { kind: 'stt.utterance', text: TEXT })
  s.at(5_000, silence(true))
  s.tickTo(5_450)
  s.at(5_500, verdict('READY'))
  s.tickTo(5_800)
  s.all(5_800, finished(1, TEXT))
  s.at(5_900, silence(false))
  s.at(6_300, silence(true))
}

const reply = (playing: boolean): VoiceEventBody =>
  ({ kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: !playing, playing })

describe('a line dropped because they spoke again @SC-2229 @SC-2226', () => {
  it('is no line: the "not yet" hums in the pause they are in', () => {
    const s = setup()
    falseFinish(s)
    s.tickTo(6_550)
    s.all(6_600, answer(1, 'droppedLine'))
    s.tickTo(6_800)
    expect(s.misses()).toEqual([])
    expect(s.hums()).toMatchObject([{ t: 6_650, notYet: true }])
  })

  it('where a line that plays says why there is no hum', () => {
    const s = setup()
    falseFinish(s)
    s.tickTo(6_550)
    s.all(6_600, answer(1, 'line'))
    s.tickTo(6_800)
    expect(s.hums()).toEqual([])
    expect(s.misses().map(m => m.why)).toEqual(['the light model said a line of its own'])
  })
})

describe('no hum once the turn is handed over or closed @SC-2229 @SC-2226', () => {
  it('handed over in a pause: no hum in it, a near miss says why; the next turn after the reply hums again', () => {
    const s = setup()
    falseFinish(s)
    s.tickTo(6_350)
    s.all(6_350, answer(1, 'handedOver'))
    s.tickTo(6_750)
    s.at(6_800, verdict('UNCERTAIN'))
    s.tickTo(7_400)
    s.at(7_500, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().map(m => m.why)).toEqual(['the turn was handed over'])

    s.at(8_000, silence(true))
    s.at(8_500, reply(true))
    s.at(10_000, reply(false))
    s.talk(11_000, 16_000)
    s.tickTo(16_700)
    expect(s.hums()).toHaveLength(1)
  })

  it('closed by the light model: no hum in that pause; once they speak again, a new turn may', () => {
    const s = setup()
    falseFinish(s)
    s.tickTo(6_350)
    s.at(6_350, { kind: 'listen.answer', call: 1, action: 'close_turn', nextCheckSecs: 5, turn: 'closed', lineId: 'L1' })
    s.at(6_350, { kind: 'listen.turn', state: 'closed' })
    s.at(6_800, verdict('UNCERTAIN'))
    s.tickTo(7_400)
    s.at(7_500, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().map(m => m.why)).toEqual(['the light model closed the turn'])
    s.at(12_000, silence(true))
    s.tickTo(12_450)
    s.at(12_500, verdict('UNCERTAIN'))
    s.tickTo(13_000)
    expect(s.hums()).toHaveLength(1)
  })
})
