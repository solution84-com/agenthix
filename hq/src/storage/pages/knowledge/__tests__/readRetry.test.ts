import { describe, expect, it } from 'vitest'
import { isNotFound, retryUnlessGone } from '../readRetry'

describe('retrying a knowledge read @SC-1429', () => {
  it('never asks again once the answer is "not found"', () => {
    const gone = Object.assign(new Error('There is no such page here.'), { statusCode: 404 })
    expect(isNotFound(gone)).toBe(true)
    expect(retryUnlessGone(0, gone)).toBe(false)
  })

  it('never tries again for a site that does not answer (HQ already waited), but a few times when HQ itself did not', () => {
    const silent = Object.assign(new Error('The site could not be reached.'), { statusCode: 503 })
    expect(retryUnlessGone(0, silent)).toBe(false)
    expect(retryUnlessGone(0, new Error('network'))).toBe(true)
    expect(retryUnlessGone(2, new Error('network'))).toBe(true)
    expect(retryUnlessGone(3, new Error('network'))).toBe(false)
  })
})
