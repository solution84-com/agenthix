import { describe, expect, it } from 'vitest'
import { isNotFound, retryUnlessGone } from '../readRetry'

describe('retrying a knowledge read @SC-1429', () => {
  it('never asks again once the answer is "not found"', () => {
    const gone = Object.assign(new Error('There is no such page here.'), { statusCode: 404 })
    expect(isNotFound(gone)).toBe(true)
    expect(retryUnlessGone(0, gone)).toBe(false)
  })

  it('still tries a few times for a site that does not answer, then stops', () => {
    const slow = Object.assign(new Error('The site could not be reached.'), { statusCode: 503 })
    expect(retryUnlessGone(0, slow)).toBe(true)
    expect(retryUnlessGone(2, slow)).toBe(true)
    expect(retryUnlessGone(3, slow)).toBe(false)
    expect(retryUnlessGone(0, new Error('network'))).toBe(true)
  })
})
