import { describe, expect, it } from 'vitest'
import { cleanUpOnFailure } from './cleanUpOnFailure'

describe('cleanUpOnFailure', () => {
  it('returns the step\'s result and does not clean up when it succeeds', async () => {
    let cleaned = false
    await expect(cleanUpOnFailure(async () => 7, async () => { cleaned = true })).resolves.toBe(7)
    expect(cleaned).toBe(false)
  })

  it('cleans up, then throws the step\'s own error, when it fails (database provisioning, for one)', async () => {
    const order: string[] = []
    await expect(cleanUpOnFailure(
      async () => { order.push('step'); throw new Error('db provisioning failed') },
      async () => { order.push('cleanup') },
    )).rejects.toThrow('db provisioning failed')
    expect(order).toEqual(['step', 'cleanup'])
  })

  it('throws the step\'s error even when the cleanup fails too', async () => {
    await expect(cleanUpOnFailure(
      async () => { throw new Error('first') },
      async () => { throw new Error('second') },
    )).rejects.toThrow('first')
  })
})
