import { describe, it, expect } from 'vitest'
import { memberProjects } from '../placeList'

const row = (over: Record<string, unknown>) => ({ id: 'p', key: 'KEY', name: 'Name', isMember: true, personalOwnerId: null, personalSpace: false, ...over })

describe('the places a conversation can start in', () => {
  it('lists the projects the person is in, their personal projects among them marked Only you, and not their space', () => {
    const rows = memberProjects([
      row({ id: 'a', key: 'AAA', name: 'Website' }),
      row({ id: 'b', key: 'BBB', name: 'Tax return', personalOwnerId: 'u1' }),
      row({ id: 'c', key: 'MY', name: 'My tasks', personalOwnerId: 'u1', personalSpace: true }),
      row({ id: 'd', key: 'DDD', name: 'Not mine', isMember: false }),
    ])
    expect(rows).toEqual([
      { ref: { kind: 'project', key: 'AAA' }, id: 'a', name: 'Website' },
      { ref: { kind: 'project', key: 'BBB' }, id: 'b', name: 'Tax return', onlyYou: true },
    ])
  })
})
