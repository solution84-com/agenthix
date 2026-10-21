import { describe, expect, it } from 'vitest'
import { fakeTurnModel, fakeVoiceActivityModel } from '../fakes'

describe("the models' fakes", () => {
  it('answer from the script in order, repeating the last entry, and keep what they were asked', async () => {
    const vad = fakeVoiceActivityModel([0.1, 0.9])
    const frame = new Float32Array(512).fill(0.5)
    expect([await vad.score(frame), await vad.score(frame), await vad.score(frame)]).toEqual([0.1, 0.9, 0.9])
    vad.reset()
    expect(vad.frames).toHaveLength(3)
    expect(vad.resets).toBe(1)
    frame.fill(0)
    expect(vad.frames[0]![0]).toBe(0.5)
  })

  it('fail on an Error entry and never answer on a null one', async () => {
    const turn = fakeTurnModel([new Error('model failed'), null])
    await expect(turn.score(new Float32Array(10))).rejects.toThrow('model failed')
    const stalled = await Promise.race([turn.score(new Float32Array(10)), new Promise((r) => setTimeout(() => r('none'), 20))])
    expect(stalled).toBe('none')
    expect(turn.asked).toHaveLength(2)
  })
})
