import { describe, it, expect, vi } from 'vitest'
import { isDeadlock, truncateAll, type TruncateTarget } from './truncateAll'

const deadlock = () =>
  Object.assign(new Error('Raw query failed. Code: `40P01`. Message: `deadlock detected`'), {
    code: 'P2010',
    meta: { code: '40P01', message: 'deadlock detected' },
  })

function fakeTarget(failures: unknown[]): TruncateTarget & { truncate: ReturnType<typeof vi.fn> } {
  const queue = [...failures]
  return {
    listTables: async () => ['User', 'Agent'],
    truncate: vi.fn(async () => {
      const next = queue.shift()
      if (next) throw next
    }),
  }
}

const noSleep = async (_ms: number) => {}

describe('isDeadlock', () => {
  it('recognises Postgres deadlock_detected however Prisma reports it', () => {
    expect(isDeadlock(deadlock())).toBe(true)
    expect(isDeadlock(new Error('ERROR: deadlock detected'))).toBe(true)
    expect(isDeadlock({ code: 'P2034', message: 'Transaction failed due to a write conflict or a deadlock' })).toBe(true)
  })

  it('does not treat other errors as a deadlock', () => {
    expect(isDeadlock(new Error('relation does not exist'))).toBe(false)
    expect(isDeadlock(null)).toBe(false)
    expect(isDeadlock('deadlock detected')).toBe(false)
  })
})

describe('truncateAll', () => {
  it('truncates every listed table in one statement', async () => {
    const target = fakeTarget([])
    await truncateAll(target, { sleep: noSleep })
    expect(target.truncate).toHaveBeenCalledTimes(1)
    expect(target.truncate).toHaveBeenCalledWith('"public"."User", "public"."Agent"')
  })

  it('does nothing on an empty schema', async () => {
    const target = { listTables: async () => [], truncate: vi.fn() }
    await truncateAll(target, { sleep: noSleep })
    expect(target.truncate).not.toHaveBeenCalled()
  })

  it('retries after a deadlock and succeeds', async () => {
    const target = fakeTarget([deadlock(), deadlock()])
    const sleep = vi.fn(noSleep)
    await truncateAll(target, { sleep, delayMs: 10 })
    expect(target.truncate).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20])
  })

  it('gives up after the bounded number of attempts and rethrows the deadlock', async () => {
    const error = deadlock()
    const target = fakeTarget([error, error, error, error])
    await expect(truncateAll(target, { attempts: 3, sleep: noSleep })).rejects.toBe(error)
    expect(target.truncate).toHaveBeenCalledTimes(3)
  })

  it('does not retry an error that is not a deadlock', async () => {
    const error = new Error('permission denied for table User')
    const target = fakeTarget([error])
    await expect(truncateAll(target, { sleep: noSleep })).rejects.toBe(error)
    expect(target.truncate).toHaveBeenCalledTimes(1)
  })
})
