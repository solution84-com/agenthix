import { describe, expect, it } from 'vitest'
import { floor } from '../floor'
import { scheduler } from '../scheduler'
import { VOICE_SETTINGS } from '../../settings'
import { rig, silence } from './setup'

const CAP = VOICE_SETTINGS.pause.capMs
const ready = (confidence: number, silenceMs: number) =>
  ({ kind: 'semantics.decision', answer: 'READY', confidence, silenceMs, by: 'model' }) as const
const saying = (text: string) => ({ kind: 'stt.utterance', text }) as const

function setup() {
  const r = rig([floor, scheduler], ['orchestration.send'])
  return { ...r, sends: () => r.of('orchestration.send').map(e => ({ text: e.text, trailedOff: e.trailedOff ?? false })) }
}

describe('the response scheduler and active listening', () => {
  it('marks a turn the pause cap ended while the person seemed mid-thought', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying('I think we should'))
    s.at(1_000, silence(true))
    s.at(1_000 + CAP, ready(0.1, CAP))
    expect(s.sends()).toEqual([{ text: 'I think we should', trailedOff: true }])
  })

  it('leaves unmarked a turn that ended as finished, or on the cap with the person heard to be done', () => {
    const s = setup()
    s.at(0, saying('What is the weather?'))
    s.at(500, ready(0.95, 500))
    s.at(1_000, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: false, playing: true })
    s.at(2_000, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: true, playing: false })
    s.at(3_000, saying('Move it to Tuesday'))
    s.at(3_000 + CAP, ready(0.4, CAP))
    expect(s.sends()).toEqual([
      { text: 'What is the weather?', trailedOff: false },
      { text: 'Move it to Tuesday', trailedOff: false },
    ])
  })

  it('sends no lone stop word that stopped the reply: it joins what the person says next', () => {
    const s = setup()
    s.at(0, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: false, playing: true })
    s.at(500, silence(false))
    s.at(900, { kind: 'orchestration.playback', action: 'stop', replyId: 'r1', by: 'stop-word' })
    s.at(1_000, saying('wait'))
    s.at(1_200, silence(true))
    s.at(1_700, ready(0.9, 500))
    s.tickTo(1_700 + CAP + 500)
    expect(s.sends()).toEqual([])
    s.at(6_000, silence(false))
    s.at(6_500, saying('wait, I meant Tuesday'))
    s.at(7_000, silence(true))
    s.at(7_500, ready(0.9, 500))
    expect(s.sends()).toEqual([{ text: 'wait, I meant Tuesday', trailedOff: false }])
  })

  it('keeps the message open after a reply that only asks the person to go on: what they say next joins it', () => {
    const s = setup()
    const appends = () => s.of('orchestration.send').map(e => e.append)
    s.at(0, saying('I think we should'))
    s.at(500, ready(0.1, CAP))
    s.at(1_000, { kind: 'reply.sentence', replyId: 'r1', index: 0, text: 'Mm?', encouragement: true })
    s.at(1_000, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: false, playing: true })
    s.at(1_500, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: true, playing: false })
    s.at(3_000, silence(false))
    s.at(3_200, saying('move the launch'))
    s.at(4_000, silence(true))
    s.at(4_500, ready(0.9, 500))
    expect(appends()).toEqual([false, true])
  })

  it('sends a stop word said when nothing was stopped by it', () => {
    const s = setup()
    s.at(0, saying('No'))
    s.at(500, ready(0.9, 500))
    expect(s.sends()).toEqual([{ text: 'No', trailedOff: false }])
  })
})
