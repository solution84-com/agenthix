/**
 * The backchannel's near misses (spec §The backchannel): each pause in a turn with no hum says the one rule that held
 * it back, as it ends, for the playground's Log. A pause that had its hum, or that ended the turn, says nothing.
 */
import { describe, expect, it } from 'vitest'
import { playing, silence } from '../../orchestration/__tests__/setup'
import { answer, finished, setup } from './backchannelRig'

const why = (s: ReturnType<typeof setup>) => s.misses().map(m => m.why)

describe('a pause with no hum says why @SC-2227', () => {
  it('too few seconds of speech', () => {
    const s = setup()
    s.talk(0, 2_100)
    s.tickTo(3_500)
    s.at(3_500, silence(false))
    expect(why(s)).toEqual(["only 2.1 s of speech since the agent's last sound"])
  })

  it('the sound model said finished, and they went on', () => {
    const s = setup()
    s.talk(0, 4_500, 'and that was it.', 'READY')
    s.tickTo(5_800)
    s.at(5_800, silence(false))
    expect(why(s)).toEqual(['the sound model said finished'])
  })

  it('a pause too short for the window', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(4_500, silence(true))
    s.tickTo(4_800)
    s.at(4_800, silence(false))
    expect(why(s)).toEqual(['the pause ended at 0.3 s'])
  })

  it('after a question', () => {
    const s = setup()
    s.talk(0, 4_500, 'what do you think?')
    s.tickTo(6_000)
    s.at(6_000, silence(false))
    expect(why(s)).toEqual(['after a question'])
  })

  it('the agent was speaking', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(1_000, playing('r1'))
    s.at(4_500, silence(true))
    s.tickTo(5_450)
    s.talk(5_500, 6_000)
    expect(why(s)).toEqual(['the agent was speaking'])
  })

  it('nothing for a pause that had its hum, or one that ended the turn', () => {
    const s = setup()
    s.talk(0, 4_500)
    s.tickTo(6_000)
    s.at(6_000, silence(false))
    expect(s.hums()).toHaveLength(1)
    s.at(9_000, silence(true))
    s.tickTo(9_500)
    s.at(9_500, { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' })
    s.all(9_800, finished(1, 'that was it.'))
    s.all(10_800, answer(1, 'handedOver'))
    s.tickTo(12_000)
    s.at(12_000, silence(false))
    expect(s.misses()).toEqual([])
  })
})
