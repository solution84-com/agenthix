import { describe, expect, it } from 'vitest'
import { ReadRecord } from '../readRecord'

describe('ReadRecord @SC-1403', () => {
  it('remembers a version per caller and page, and forgets it', () => {
    const r = new ReadRecord()
    r.remember('c1', 'p', 'v1')
    expect(r.recall('c1', 'p')).toBe('v1')
    expect(r.recall('c2', 'p')).toBeNull()
    r.forget('c1', 'p')
    expect(r.recall('c1', 'p')).toBeNull()
  })

  it('holds a bounded number, dropping the oldest, and lets a version lapse', () => {
    let now = 0
    const r = new ReadRecord(2, 1000, () => now)
    r.remember('c', 'a', '1')
    r.remember('c', 'b', '2')
    r.remember('c', 'c', '3')
    expect(r.recall('c', 'a')).toBeNull()
    expect(r.recall('c', 'c')).toBe('3')
    now = 1001
    expect(r.recall('c', 'b')).toBeNull()
  })
})
