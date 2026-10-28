import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { installedEntry, type InstalledAssetRow } from '../installed'

const D = 'd'.repeat(64)
const asset = (over: Partial<InstalledAssetRow> = {}): InstalledAssetRow => ({
  publisher: 'acme', name: 'code-review', givenToAll: false, builtIn: false, removedAt: null, setAsideById: null,
  currentVersion: { id: 'ver-1', version: '1.3.0', digest: D }, ...over,
})

describe('an installed skill a run is given @SC-1650', () => {
  it('at its pinned version, with the content to deliver', () => {
    expect(installedEntry(asset())).toEqual({
      identity: 'acme/code-review', version: '1.3.0', digest: D, level: 'agent', ref: { kind: 'skill', key: 'ver-1', digest: D },
    })
    expect(installedEntry(asset({ givenToAll: true }))?.level).toBe('org')
  })

  it('not once removed', () => {
    expect(installedEntry(asset({ removedAt: new Date() }))).toBeNull()
  })

  it('not while set aside for the organisation\'s own copy', () => {
    expect(installedEntry(asset({ setAsideById: 'copy' }))).toBeNull()
  })

  it('not before its first publish', () => {
    expect(installedEntry(asset({ currentVersion: null }))).toBeNull()
  })

  it('not a built-in, which comes its own way', () => {
    expect(installedEntry(asset({ builtIn: true }))).toBeNull()
  })
})
