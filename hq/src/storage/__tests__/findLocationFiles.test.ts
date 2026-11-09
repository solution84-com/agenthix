import { describe, expect, it, vi } from 'vitest'
vi.mock('wasp/server', () => ({ HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } } }))
vi.mock('../locationAccess', () => ({ assertLocationAccess: vi.fn() }))
vi.mock('../storageSite', () => ({ resolveStorageSite: vi.fn() }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: { request: vi.fn() } }))

import { findLocationFiles, findLocationFilesQuery, type FindLocationFilesDeps } from '../findLocationFiles'

const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: null }
const found = { path: 'images/revenue-by-month.png', name: 'revenue-by-month.png', folder: 'images', kind: 'file' as const, size: 9, modifiedAt: '2026-11-10T07:39:00Z', match: 'contains' as const }

describe('Search files at every depth (S5)', () => {
  it('checks the person may read the place before its site is asked', async () => {
    const order: string[] = []
    const deps: FindLocationFilesDeps = {
      checkAccess: async () => { order.push('access') },
      find: async () => { order.push('site'); return { files: [found], truncated: false } },
    }
    const result = await findLocationFiles(loc, 'revenue', 'u1', deps)
    expect(order).toEqual(['access', 'site'])
    expect(result.files).toEqual([{ path: found.path, name: found.name, folder: 'images', size: 9, modifiedAt: found.modifiedAt }])
  })

  it('never asks the site for a place the person may not read', async () => {
    const find = vi.fn()
    const deps: FindLocationFilesDeps = { checkAccess: async () => { throw new Error('no') }, find }
    await expect(findLocationFiles(loc, 'revenue', 'u1', deps)).rejects.toThrow('no')
    expect(find).not.toHaveBeenCalled()
  })

  it('refuses a request that names no place or no name, saying nothing was changed', async () => {
    const user = { user: { id: 'u1' } }
    await expect(findLocationFilesQuery({ target: { ownerType: 'nobody' } as never, fragment: 'a' }, user)).rejects.toThrow('Nothing was changed.')
    await expect(findLocationFilesQuery({ target: loc, fragment: '   ' }, user)).rejects.toThrow('Nothing was changed.')
    await expect(findLocationFilesQuery({ target: loc, fragment: 'a' }, { user: null })).rejects.toThrow('Not authenticated')
  })
})
