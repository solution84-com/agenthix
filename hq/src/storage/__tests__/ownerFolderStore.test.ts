/**
 * hq's typed caller for an owner's `artefacts/`. Addressed by
 * the owner — no location names this folder — and sent to the site that
 * holds that owner's storage, on the control channel; an unreachable site is
 * never an empty answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LOCATION_FILE_METHODS } from '@agenthix/core'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

const resolveStorageSite = vi.hoisted(() => vi.fn())
vi.mock('../storageSite', () => ({ resolveStorageSite }))

const siteRow = vi.hoisted(() => ({ label: 'Local site', status: 'offline', protocolVersion: '1.0' }))
vi.mock('wasp/server', () => ({ prisma: { executionSite: { findUnique: async () => siteRow } } }))

import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { SiteUnreachableError } from '../workspaceStore'
import { listArtefactsOnSite } from '../ownerFolderStore'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  resolveStorageSite.mockResolvedValue('site-logical-1')
})

describe('listing', () => {
  it('asks the site that holds the owner, sending the owner and nothing else', async () => {
    request.mockResolvedValue({ entries: [] })
    await listArtefactsOnSite({ ...owner, workspaceId: 'w1' } as typeof owner)
    expect(resolveStorageSite).toHaveBeenCalledWith(owner)
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.listArtefacts, owner)
  })

  it('raises an unreachable site as unreachable, not as an empty folder', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('site is offline', 'offline'))
    await expect(listArtefactsOnSite(owner)).rejects.toBeInstanceOf(SiteUnreachableError)
  })
})
