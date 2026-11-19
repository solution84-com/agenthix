/**
 * A light model's answer about a pause that has ended plays no line (the owner's playtest of 18 Nov: the sound model
 * said READY, they went on ~0.5 s later, and the hand over's hold line played over them). The decision stands; only the
 * line is dropped, hq hears it was skipped, and the runtime says why. Driven through the whole voice client.
 */
import { describe, expect, it } from 'vitest'
import { lightRig, speech } from './lightRig'

const HOLD = "Go on, I'm with you on the hike."

async function finished() {
  const r = lightRig()
  await r.start()
  await r.hear(speech(5))
  await r.silence(1_500)
  const seq = r.listens().at(-1)!.seq
  expect(r.listens().at(-1)!.moment).toBe('soundsFinished')
  return { r, seq }
}

describe('a line whose call the person spoke after is never heard', () => {
  it('a hand over answered after they went on: handed over, its hold dropped and reported skipped @SC-2229', async () => {
    const { r, seq } = await finished()
    r.line('L1', HOLD, true)
    await r.hear(speech(2, 50))
    await r.silence(600)
    r.answer({ seq, action: 'hand_over', say: HOLD, lineId: 'L1', turn: 'handedOver', turnId: 't1' })
    await r.advance(1_000)
    expect(r.linesStarted()).toEqual([])
    expect(r.lineSkipped()).toEqual(['L1'])
    expect(r.of('listen.turn').map(e => e.state)).toEqual(['handedOver'])
    expect(r.of('listen.drop')).toMatchObject([{ lineId: 'L1', call: seq, why: 'you spoke again' }])
  })

  it('a "not yet" with a line, answered while they speak: kept open, the line dropped whenever its audio comes @SC-2229', async () => {
    const { r, seq } = await finished()
    await r.hear(speech(8, 50))
    r.answer({ seq, action: 'acknowledge', say: 'Right.', lineId: 'L2' })
    r.line('L2', 'Right.')
    await r.advance(1_500)
    expect(r.linesStarted()).toEqual([])
    expect(r.lineSkipped()).toEqual(['L2'])
    expect(r.of('listen.turn').map(e => e.state)).toEqual(['notYet'])
  })

  it('the same answer while they stayed quiet plays its line @SC-2229', async () => {
    const { r, seq } = await finished()
    r.answer({ seq, action: 'acknowledge', say: 'Right.', lineId: 'L3' })
    r.line('L3', 'Right.')
    await r.advance(1_500)
    expect(r.linesStarted()).toEqual(['Right.'])
    expect(r.lineSkipped()).toEqual([])
  })

  it('a line allowed in quiet whose audio comes once they speak again is dropped as it would start @SC-2229', async () => {
    const { r, seq } = await finished()
    r.answer({ seq, action: 'acknowledge', say: 'Right.', lineId: 'L4' })
    await r.hear(speech(8, 50))
    r.line('L4', 'Right.')
    await r.advance(100)
    expect(r.linesStarted()).toEqual([])
    expect(r.lineSkipped()).toEqual(['L4'])
    expect(r.of('listen.drop')).toMatchObject([{ lineId: 'L4', why: 'you were speaking' }])
  })
})
