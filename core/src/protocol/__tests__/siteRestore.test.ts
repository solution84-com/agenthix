import { describe, expect, it } from 'vitest'
import { parseSiteRestoreReport } from '../index.js'

describe('site.restoreReport', () => {
  it('reads what a site holds and the backup it came back from', () => {
    expect(parseSiteRestoreReport({
      restored: { night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z' },
      workspaces: [{ id: 'w1', ownerType: 'project', ownerId: 'p1', extra: 'dropped' }],
    })).toEqual({
      restored: { night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z' },
      workspaces: [{ id: 'w1', ownerType: 'project', ownerId: 'p1' }],
    })
    expect(parseSiteRestoreReport({ restored: null, workspaces: [] })).toEqual({ restored: null, workspaces: [] })
  })

  it('refuses an answer it cannot read rather than guessing', () => {
    expect(parseSiteRestoreReport(null)).toBeNull()
    expect(parseSiteRestoreReport({ workspaces: [] })).toBeNull()
    expect(parseSiteRestoreReport({ restored: { night: 'last night', takenAt: 'x' }, workspaces: [] })).toBeNull()
    expect(parseSiteRestoreReport({ restored: null, workspaces: [{ id: 'w', ownerType: 'team', ownerId: 'x' }] })).toBeNull()
  })
})
