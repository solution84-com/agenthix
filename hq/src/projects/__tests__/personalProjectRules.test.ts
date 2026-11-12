import { describe, it, expect } from 'vitest'
import { changesYourSpaceIdentity, isYourSpace, placeStorageOf } from '../personalProject'

const space = { id: 'p1', personalOwnerId: 'u1', personalSpace: true }
const side = { id: 'p2', personalOwnerId: 'u1', personalSpace: false }
const shared = { id: 'p3', personalOwnerId: null, personalSpace: false }

describe('where a project’s storage is @SC-1210', () => {
  it('is the person’s own for their space, and the project’s own for every other project, a personal one included', () => {
    expect(placeStorageOf(space)).toEqual({ ownerType: 'user', ownerId: 'u1' })
    expect(placeStorageOf(side)).toEqual({ ownerType: 'project', ownerId: 'p2' })
    expect(placeStorageOf(shared)).toEqual({ ownerType: 'project', ownerId: 'p3' })
  })

  it('knows the space only by its mark, owned by a person', () => {
    expect([space, side, shared].map(isYourSpace)).toEqual([true, false, false])
    expect(isYourSpace({ personalOwnerId: null, personalSpace: true })).toBe(false)
  })
})

describe('what changes Your space’s name or key @SC-2115', () => {
  const current = { name: 'My tasks', key: 'MYABC' }

  it('is a different name or a different key', () => {
    expect(changesYourSpaceIdentity(current, { name: 'Mine' })).toBe(true)
    expect(changesYourSpaceIdentity(current, { key: 'MYXYZ' })).toBe(true)
  })

  it('is not a description-only change, or a name and key sent back as they are', () => {
    expect(changesYourSpaceIdentity(current, {})).toBe(false)
    expect(changesYourSpaceIdentity(current, { name: 'My tasks', key: 'MYABC' })).toBe(false)
  })
})
