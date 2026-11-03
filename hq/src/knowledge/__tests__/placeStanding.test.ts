import { describe, expect, it, vi } from 'vitest'

vi.mock('../../projects/membership', () => ({
  projectStanding: async (projectId: string, userId: string) => (projectId === 'p1' && userId === 'viv' ? 'reads' : 'none'),
}))

import { placeStanding } from '../placeStanding'

describe('placeStanding @SC-1404', () => {
  it('reads a project\'s standing from its member rows, so its Viewer only reads', async () => {
    expect(await placeStanding({ ownerType: 'project', ownerId: 'p1' }, 'viv')).toBe('reads')
    expect(await placeStanding({ ownerType: 'project', ownerId: 'p2' }, 'viv')).toBe('none')
  })

  it('gives a person\'s own space to that person alone, and the organisation to no one as a place', async () => {
    expect(await placeStanding({ ownerType: 'user', ownerId: 'viv' }, 'viv')).toBe('works')
    expect(await placeStanding({ ownerType: 'user', ownerId: 'sam' }, 'viv')).toBe('none')
    expect(await placeStanding({ ownerType: 'org', ownerId: 'org' }, 'viv')).toBe('none')
  })
})
