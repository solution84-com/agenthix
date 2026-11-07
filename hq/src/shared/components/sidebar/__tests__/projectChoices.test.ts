import { describe, it, expect } from 'vitest'
import { findProjectGroups, movedProjectPin, pinnedProjectIds, projectAt, splitPinned } from '../projectChoices'

const p = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, key: id.toUpperCase(), name, isMember: true, ...extra })
const projects = [p('web', 'Website relaunch'), p('agx', 'Agenthix'), p('cus', 'Customer research'), p('out', 'Not mine', { isMember: false }), p('me', 'Your space', { personalSpace: true })]
const pins = [
  { id: 'pin-c', kind: 'PROJECT', itemId: 'cus' },
  { id: 'pin-b', kind: 'BOARD', itemId: 'b1' },
  { id: 'pin-w', kind: 'PROJECT', itemId: 'web' },
  { id: 'pin-a', kind: 'AGENT', itemId: 'a1' },
]

describe('pinned projects first', () => {
  it('reads only the project pins, in their order', () => {
    expect(pinnedProjectIds(pins)).toEqual(['cus', 'web'])
  })

  it('splits rows into the pinned, in the pins’ order, and the rest, in the order given', () => {
    const { pinned, rest } = splitPinned(projects, ['cus', 'gone', 'web'])
    expect(pinned.map((r) => r.id)).toEqual(['cus', 'web'])
    expect(rest.map((r) => r.id)).toEqual(['agx', 'out', 'me'])
  })
})

describe('Find a project', () => {
  it('lists your projects, pinned first, then the others A–Z, never your space or one you are not in', () => {
    const { pinned, others } = findProjectGroups(projects, pins, '')
    expect(pinned.map((r) => r.name)).toEqual(['Customer research', 'Website relaunch'])
    expect(others.map((r) => r.name)).toEqual(['Agenthix'])
  })

  it('narrows both groups to the names that hold the search, whatever the case', () => {
    const { pinned, others } = findProjectGroups(projects, pins, '  RE ')
    expect(pinned.map((r) => r.name)).toEqual(['Customer research', 'Website relaunch'])
    expect(others).toEqual([])
    expect(findProjectGroups(projects, pins, 'agen').others.map((r) => r.name)).toEqual(['Agenthix'])
  })

  it('lands on the same section of the project chosen, Overview at its own address', () => {
    expect(projectAt('WEB', 'boards')).toBe('/projects/WEB?tool=boards')
    expect(projectAt('WEB', 'overview')).toBe('/projects/WEB')
    expect(projectAt('WEB', null)).toBe('/projects/WEB')
  })
})

describe('reordering pinned projects', () => {
  it('moves a project among the pinned projects, the other pins keeping their places', () => {
    expect(movedProjectPin(pins, 'web', -1)).toEqual(['pin-w', 'pin-c', 'pin-b', 'pin-a'])
    expect(movedProjectPin(pins, 'cus', 1)).toEqual(['pin-b', 'pin-w', 'pin-c', 'pin-a'])
  })

  it('cannot move the first earlier, the last later, or a project that is not pinned', () => {
    expect(movedProjectPin(pins, 'cus', -1)).toBeNull()
    expect(movedProjectPin(pins, 'web', 1)).toBeNull()
    expect(movedProjectPin(pins, 'agx', 1)).toBeNull()
  })
})
