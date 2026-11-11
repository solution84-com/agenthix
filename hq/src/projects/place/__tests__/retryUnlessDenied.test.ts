import { describe, it, expect } from 'vitest'
import { retryUnlessDenied } from '../retryUnlessDenied'

const withStatus = (statusCode: number) => Object.assign(new Error('x'), { statusCode })

describe('retryUnlessDenied', () => {
  it.each([401, 403, 404])('never retries an answer of %i', status => {
    expect(retryUnlessDenied(0, withStatus(status))).toBe(false)
  })

  it('retries other failures three times, then stops', () => {
    expect(retryUnlessDenied(0, withStatus(500))).toBe(true)
    expect(retryUnlessDenied(2, new Error('network'))).toBe(true)
    expect(retryUnlessDenied(3, withStatus(500))).toBe(false)
  })
})
