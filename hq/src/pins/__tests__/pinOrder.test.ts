import { describe, it, expect } from 'vitest'
import { movedOrder } from '../pinOrder'

describe('movedOrder @SC-492', () => {
  it('moves an item down to where the target was', () => {
    expect(movedOrder(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up to where the target was', () => {
    expect(movedOrder(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the order alone for a drop on itself or an unknown id', () => {
    const ids = ['a', 'b']
    expect(movedOrder(ids, 'a', 'a')).toBe(ids)
    expect(movedOrder(ids, 'x', 'a')).toBe(ids)
    expect(movedOrder(ids, 'a', 'x')).toBe(ids)
  })
})
