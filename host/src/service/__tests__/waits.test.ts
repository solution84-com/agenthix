import { describe, expect, it } from 'vitest'
import { HQ_WAIT_MS, waitsFor } from '../context'

describe('the wait for HQ', () => {
  it('is ten minutes unless a development build is told otherwise', () => {
    expect(HQ_WAIT_MS).toBe(10 * 60_000)
    expect(waitsFor(true, {}).hqMs).toBe(HQ_WAIT_MS)
    expect(waitsFor(true, { HOST_DEV_HQ_WAIT_SECONDS: '90' }).hqMs).toBe(90_000)
  })

  it('is never shortened for a published version', () => {
    expect(waitsFor(false, { HOST_DEV_HQ_WAIT_SECONDS: '90' }).hqMs).toBe(HQ_WAIT_MS)
  })

  it('ignores a setting that is not a whole number of seconds above nought', () => {
    for (const value of ['', '0', '-5', '1.5', 'soon']) expect(waitsFor(true, { HOST_DEV_HQ_WAIT_SECONDS: value }).hqMs).toBe(HQ_WAIT_MS)
  })

  it('leaves the site and the polling as they were', () => {
    expect(waitsFor(true, { HOST_DEV_HQ_WAIT_SECONDS: '90' })).toMatchObject({ siteMs: 3 * 60_000, pollMs: 3_000 })
  })
})
