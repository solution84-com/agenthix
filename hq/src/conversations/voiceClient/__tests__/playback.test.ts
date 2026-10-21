import { describe, expect, it } from 'vitest'
import { heardThrough, playheadAt } from '../playback'

const clocks = new Map([[0, { start: 1, end: 2 }], [1, { start: 2, end: 3.5 }], [2, { start: 3.5, end: 4 }]])
const whole = (i: number) => i < 2

describe('where the ear is @SC-997', () => {
  it('has no position before the first sentence starts', () => {
    expect(playheadAt(clocks, 0.5, whole)).toBeNull()
  })
  it('names the sentence playing and how far into it', () => {
    expect(playheadAt(clocks, 2.5, whole)).toEqual({ index: 1, elapsed: 0.5, ended: false })
  })
  it('says a sentence ended only when it is whole and its time is past', () => {
    expect(playheadAt(clocks, 3.2, whole)).toMatchObject({ index: 1, ended: false })
    expect(playheadAt(clocks, 5, whole)).toMatchObject({ index: 2, ended: false })
    expect(playheadAt(clocks, 5, () => true)).toMatchObject({ index: 2, ended: true })
  })
})

describe('what was heard when the person spoke over the reply @SC-997', () => {
  it('is -1 when no sentence was heard to its end', () => {
    expect(heardThrough(clocks, 1.5, whole)).toBe(-1)
  })
  it('is the last sentence heard to its end', () => {
    expect(heardThrough(clocks, 3.0, whole)).toBe(0)
    expect(heardThrough(clocks, 3.6, whole)).toBe(1)
  })
  it('does not count a sentence still being received', () => {
    expect(heardThrough(clocks, 9, whole)).toBe(1)
  })
})
