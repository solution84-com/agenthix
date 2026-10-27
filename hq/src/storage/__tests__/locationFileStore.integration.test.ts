/**
 * hq's typed caller for a site's own files, when the site will not answer:
 * against the real test database, because what it says depends on the site's
 * own row — its label, whether it was revoked, and the protocol version it last
 * presented. Where a location lives is resolved for real too. The two
 * transports to the site are the stand-ins.
 *
 * An unreachable site surfaces as itself — never an empty listing, which would
 * make "the site is down" indistinguishable from "there is nothing here".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, ensureExecutionSite } from '../../test/factories'

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
vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { ContentStreamFailed } from '../../sites/content/contentStream'
import { listFilesOnSite, statFileOnSite, readFileOnSite, removeLocationOnSite } from '../locationFileStore'
import { SiteUnreachableError } from '../workspaceStore'

let loc: { ownerType: 'project'; ownerId: string }
let siteRowId: string

beforeEach(async () => {
  request.mockReset()
  openContentStream.mockReset()
  const site = await ensureExecutionSite({ label: 'Local site', protocolVersion: '1.0' })
  siteRowId = site.id
  loc = { ownerType: 'project', ownerId: (await createProject({ executionSiteId: site.id })).id }
})

describe('a site that will not answer', () => {
  for (const code of ['offline', 'timeout', 'disconnected'] as const) {
    it(`surfaces a ${code} failure as an unreachable site named by its label, never as an empty listing`, async () => {
      request.mockRejectedValue(new ChannelRequestFailed('gone', code))
      const err = await listFilesOnSite(loc).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(SiteUnreachableError)
      expect(err).toMatchObject({ siteLabel: "Local site · HQ's site" })
    })
  }

  it('leaves any other channel failure as what it is', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('the path is outside the location', 'handler_failed'))
    await expect(statFileOnSite(loc, '../escape')).rejects.toThrow(/outside the location/)
  })

  it('leaves an unknown method as the failure it is, on either method', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('Unknown method: location.listFiles', 'unknown_method'))
    await expect(listFilesOnSite(loc)).rejects.toBeInstanceOf(ChannelRequestFailed)
    request.mockRejectedValue(new ChannelRequestFailed('Unknown method: location.remove', 'unknown_method'))
    await expect(removeLocationOnSite(loc)).rejects.toBeInstanceOf(ChannelRequestFailed)
  })

  it('surfaces an unreachable site as itself when removing', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('gone', 'offline'))
    await expect(removeLocationOnSite(loc, { wholeOwner: true, logicalSiteId: 'site-kept' })).rejects.toBeInstanceOf(SiteUnreachableError)
  })
})

describe('reading through the content transport from a site that will not answer', () => {
  it('surfaces an unreachable site as itself rather than as an empty file', async () => {
    openContentStream.mockRejectedValue(new ContentStreamFailed('no content connection', 'offline'))
    await expect(readFileOnSite(loc, 'ROADMAP.md')).rejects.toBeInstanceOf(SiteUnreachableError)
  })
})
