import { describe, expect, it } from 'vitest'
import { compareRestore, restoredNotice, unrecognisedNotice } from '../restoreCompare'

const w = (id: string, ownerId = 'p1') => ({ id, ownerType: 'project' as const, ownerId })
const restored = { night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z' }

describe('reconciling after a restore', () => {
  it('finds what a restored site lost: what HQ placed there that it no longer holds', () => {
    const r = compareRestore({ restored, workspaces: [w('a')] }, ['a', 'b', 'c'], () => true)
    expect(r.lost).toEqual(['b', 'c'])
  })

  it('reports nothing lost when the site was not restored', () => {
    expect(compareRestore({ restored: null, workspaces: [w('a')] }, ['a', 'b'], () => true).lost).toEqual([])
  })

  it('takes back what a restored HQ has no placement for when it knows the owner, and names the rest', () => {
    const r = compareRestore({ restored: null, workspaces: [w('a'), w('new', 'p1'), w('stranger', 'p9')] }, ['a'], x => x.ownerId === 'p1')
    expect(r.takeBack.map(x => x.id)).toEqual(['new'])
    expect(r.unrecognised.map(x => x.id)).toEqual(['stranger'])
  })

  it('says plainly what was lost', () => {
    expect(restoredNotice('office-server', restored, 2, 'UTC')).toEqual({
      title: 'office-server was restored from a backup',
      body: 'Restored from the night of 12 October, 02:00. Files changed after 02:00 were lost with the machine. HQ has checked which workspaces it holds; 2 workspaces HQ placed there are not back.',
    })
    expect(restoredNotice('office-server', restored, 0, 'UTC').body).toContain('every one HQ placed there is back.')
    expect(unrecognisedNotice('office-server', 1, 2).title).toBe('office-server holds 1 workspace HQ does not recognise')
  })
})
