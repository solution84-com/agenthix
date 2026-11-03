import { beforeEach, describe, expect, it } from 'vitest'
import { __resetStartingForTests, doneStarting, isStarting, markStarting } from '../working'

describe('a branch a run is starting on @SC-1676', () => {
  beforeEach(() => __resetStartingForTests())

  it('is starting until every dispatch that marked it is done', () => {
    markStarting('b1')
    markStarting('b1')
    doneStarting('b1')
    expect(isStarting('b1')).toBe(true)
    doneStarting('b1')
    expect(isStarting('b1')).toBe(false)
  })

  it('is not starting when nothing marked it, and one done too many does no harm', () => {
    doneStarting('b2')
    expect(isStarting('b2')).toBe(false)
  })
})
