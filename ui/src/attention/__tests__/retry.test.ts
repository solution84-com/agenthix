import { afterEach, describe, expect, it, vi } from 'vitest'
import { backgroundRetry, backgroundRetryDelay, isFinal, retryRead } from '../retry'

const failing = (status?: number) => Object.assign(new Error('no'), status ? { statusCode: status } : {})

afterEach(() => { vi.useRealTimers() })

describe('the quiet retry @SC-1940', () => {
  it.each([400, 401, 403, 404, 409, 422])('takes %i as a final answer', status => {
    expect(isFinal(failing(status))).toBe(true)
    expect(isFinal({ status })).toBe(true)
    expect(isFinal({ response: { status } })).toBe(true)
    expect(backgroundRetry(0, failing(status))).toBe(false)
  })

  it('retries anything else three times after the first failure', () => {
    expect(isFinal(failing(503))).toBe(false)
    expect(isFinal(new Error('fetch failed'))).toBe(false)
    expect([0, 1, 2, 3].map(n => backgroundRetry(n, failing(503)))).toEqual([true, true, true, false])
  })

  it('waits about 1, 2 and 4 seconds, each within 20 %', () => {
    expect([0, 1, 2].map(a => backgroundRetryDelay(a, () => 0.5))).toEqual([1000, 2000, 4000])
    expect(backgroundRetryDelay(0, () => 0)).toBe(800)
    expect(backgroundRetryDelay(2, () => 1)).toBe(4800)
  })

  it('retryRead answers with the first good read, after the policy\'s waits', async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockRejectedValueOnce(failing(503)).mockRejectedValueOnce(failing()).mockResolvedValue('ok')
    const done = retryRead(read)
    await vi.advanceTimersByTimeAsync(1200)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2400)
    await expect(done).resolves.toBe('ok')
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('retryRead gives up at once on a final answer, and after three retries otherwise', async () => {
    vi.useFakeTimers()
    const gone = vi.fn().mockRejectedValue(failing(404))
    await expect(retryRead(gone)).rejects.toThrow('no')
    expect(gone).toHaveBeenCalledTimes(1)
    const down = vi.fn().mockRejectedValue(failing(503))
    const done = retryRead(down)
    const caught = done.catch(e => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await caught).toBeInstanceOf(Error)
    expect(down).toHaveBeenCalledTimes(4)
  })
})
