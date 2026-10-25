/**
 * hq's typed caller for an owner's `artefacts/`. Addressed by
 * the owner — no location names this folder — and sent to the site that
 * holds that owner's storage: listings on the control channel, bytes on the
 * content transport, and an unreachable site never an empty answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'node:stream'
import { LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

const openContentStream = vi.hoisted(() => vi.fn())
vi.mock('../../sites/content', async () => {
  const { ContentStreamFailed } = await import('../../sites/content/contentStream')
  return { openContentStream, ContentStreamFailed }
})

const resolveStorageSite = vi.hoisted(() => vi.fn())
vi.mock('../storageSite', () => ({ resolveStorageSite }))

const siteRow = vi.hoisted(() => ({ label: 'Local site', status: 'offline', protocolVersion: '1.0' }))
vi.mock('wasp/server', () => ({ prisma: { executionSite: { findUnique: async () => siteRow } } }))

import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { ContentStreamFailed } from '../../sites/content/contentStream'
import { SiteUnreachableError } from '../workspaceStore'
import { listArtefactsOnSite, readArtefactOnSite } from '../ownerFolderStore'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }

function streamOf(...chunks: string[]) {
  const stream = new PassThrough()
  setImmediate(() => {
    for (const chunk of chunks) stream.write(chunk)
    stream.end()
  })
  return stream
}

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

describe('reading', () => {
  it('reads an artefact by name on the content transport with the size bound', async () => {
    openContentStream.mockResolvedValueOnce(streamOf('# Pricing\n'))
    expect((await readArtefactOnSite(owner, 'pricing.md', 100)).toString('utf8')).toBe('# Pricing\n')
    expect(openContentStream).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.readArtefact, {
      ...owner, name: 'pricing.md', maxBytes: 100,
    })
    expect(request).not.toHaveBeenCalled()
  })

  it("comes back carrying the site's own code when it refuses", async () => {
    const wire = new LocationFileError('too_large', 'location.readArtefact "big.pdf" in project p1 artefacts').message
    openContentStream.mockRejectedValue(new ContentStreamFailed(wire, 'handler_failed'))
    const err = await readArtefactOnSite(owner, 'big.pdf', 10).catch((e: unknown) => e)
    expect((err as LocationFileError).code).toBe('too_large')
  })
})
