import { describe, it, expect, afterEach } from 'vitest'
import { withoutPrismaEnvFile, withoutPrismaEnvFileAsync } from './prismaEnvFile'

const ADDED = 'PRISMA_ENV_FILE_TEST_ADDED'
const KEPT = 'PRISMA_ENV_FILE_TEST_KEPT'

afterEach(() => {
  delete process.env[ADDED]
  delete process.env[KEPT]
})

describe('withoutPrismaEnvFile', () => {
  it('removes what the load added, keeps what was already set, and returns its result', () => {
    process.env[KEPT] = 'mine'
    const result = withoutPrismaEnvFile(() => {
      process.env[ADDED] = 'from the file'
      return 'client'
    })
    expect(result).toBe('client')
    expect(process.env[ADDED]).toBeUndefined()
    expect(process.env[KEPT]).toBe('mine')
  })

  it('removes what was added even when the load throws', () => {
    expect(() =>
      withoutPrismaEnvFile(() => {
        process.env[ADDED] = 'from the file'
        throw new Error('no engine')
      })
    ).toThrow('no engine')
    expect(process.env[ADDED]).toBeUndefined()
  })

  it('does the same for an asynchronous load', async () => {
    await withoutPrismaEnvFileAsync(async () => {
      process.env[ADDED] = 'from the file'
    })
    expect(process.env[ADDED]).toBeUndefined()
  })
})
