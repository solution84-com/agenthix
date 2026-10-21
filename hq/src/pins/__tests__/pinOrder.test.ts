import { describe, it, expect } from 'vitest'
import { movedOrder, activePinId, rowPinId } from '../pinOrder'

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

describe('activePinId @SC-492 @SC-150', () => {
  const items = [
    { id: 'project', href: '/projects/AGX' },
    { id: 'board', href: '/projects/AGX/boards/b1' },
    { id: 'agent', href: '/agents/pm' },
  ]

  it("highlights a project's pin anywhere inside the project", () => {
    expect(activePinId(items, '/projects/AGX')).toBe('project')
    expect(activePinId(items, '/projects/AGX/settings')).toBe('project')
  })

  it('prefers the most specific pin', () => {
    expect(activePinId(items, '/projects/AGX/boards/b1')).toBe('board')
  })

  it('does not match a path that only shares the first letters', () => {
    expect(activePinId(items, '/projects/AGXY')).toBeNull()
    expect(activePinId(items, '/sessions/1')).toBeNull()
  })
})

describe('rowPinId', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('is the first pin before any has been used', () => {
    expect(rowPinId(items, [], null)).toBe('a')
  })

  it('is the pin used last', () => {
    expect(rowPinId(items, ['c', 'b'], null)).toBe('c')
  })

  it('skips the pin you are in, then the next one used', () => {
    expect(rowPinId(items, ['c', 'b'], 'c')).toBe('b')
  })

  it('falls back to the first pin that is not here when nothing used is left', () => {
    expect(rowPinId(items, ['c'], 'c')).toBe('a')
    expect(rowPinId(items, [], 'a')).toBe('b')
  })

  it('ignores a used pin that has since been unpinned', () => {
    expect(rowPinId(items, ['gone', 'b'], null)).toBe('b')
  })

  it('shows the only pin even when it is where you are', () => {
    expect(rowPinId([{ id: 'a' }], [], 'a')).toBe('a')
  })
})
