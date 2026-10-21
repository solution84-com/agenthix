import { beforeEach, describe, expect, it } from 'vitest'
import { forgetReadBacks, READ_BACK_STANDS_MS, readBackFirst } from '../readBack'

beforeEach(() => forgetReadBacks())

describe('a read-back before a spoken yes @SC-999', () => {
  it('is asked first, and the yes in a later turn counts once', () => {
    expect(readBackFirst('op1', 't1', 'deploy to staging', 0)).toBe('Approving: deploy to staging. Yes?')
    expect(readBackFirst('op1', 't2', 'deploy to staging', 1_000)).toBeNull()
    expect(readBackFirst('op1', 't3', 'deploy to staging', 2_000)).not.toBeNull()
  })

  it('a yes in the same turn as the read-back does not count', () => {
    readBackFirst('op1', 't1', 'x', 0)
    expect(readBackFirst('op1', 't1', 'x', 1)).not.toBeNull()
  })

  it('a read-back left too long is asked again', () => {
    readBackFirst('op1', 't1', 'x', 0)
    expect(readBackFirst('op1', 't2', 'x', READ_BACK_STANDS_MS + 1)).not.toBeNull()
  })

  it('is for its own request only', () => {
    readBackFirst('op1', 't1', 'x', 0)
    expect(readBackFirst('op2', 't2', 'y', 1)).not.toBeNull()
  })
})
