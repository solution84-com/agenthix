import { describe, it, expect } from 'vitest'
import { assertPoolHolds, type AcquireWhileHeld } from './poolPrecondition'

// A pool of `size` connections: an acquire beyond the size waits for one to be
// released, which is exactly what makes a too-small pool unable to hold N at once.
function fakePool(size: number): AcquireWhileHeld {
  let free = size
  const waiting: Array<() => void> = []
  const take = () =>
    free > 0
      ? (free--, Promise.resolve())
      : new Promise<void>((resolve) => waiting.push(() => (free--, resolve())))
  const give = () => {
    free++
    waiting.shift()?.()
  }
  return async (whileHeld) => {
    await take()
    try {
      await whileHeld()
    } finally {
      give()
    }
  }
}

describe('assertPoolHolds', () => {
  it('passes when the pool can hold every connection at once', async () => {
    await expect(assertPoolHolds(5, fakePool(5), 200)).resolves.toBeUndefined()
    await expect(assertPoolHolds(5, fakePool(8), 200)).resolves.toBeUndefined()
  })

  it('fails with an explicit message when the pool is smaller', async () => {
    await expect(assertPoolHolds(5, fakePool(3), 50)).rejects.toThrow(
      /needs 5 database connections at once but the pool handed out 3/
    )
  })

  it('surfaces an acquisition failure that is not a shortfall', async () => {
    const boom = new Error('connection refused')
    const acquire: AcquireWhileHeld = async (whileHeld) => {
      await whileHeld()
      throw boom
    }
    await expect(assertPoolHolds(2, acquire, 200)).rejects.toBe(boom)
  })
})
