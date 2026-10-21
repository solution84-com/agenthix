/**
 * hq's typed caller for a site's own files — the control-channel calls.
 * Reading files is locationFileStore.reads.test.ts; a site that will not answer
 * (which reads the site's row) is locationFileStore.integration.test.ts.
 *
 * Three properties matter here and each is pinned rather than read off the
 * code:
 *
 *  1. **Every method name comes from core's constant**, so a typo fails to
 *     compile rather than mismatching at the wire.
 *  2. **An unreachable site surfaces as itself.** `offline`, `timeout` and
 *     `disconnected` all become `SiteUnreachableError` — never an empty
 *     listing, which would make "the site is down" indistinguishable from
 *     "there is nothing here".
 *  3. **Only the four location fields cross.** hq's callers hold location-ish
 *     objects that carry other columns; site validates strictly and would
 *     refuse them.
 *
 * This store adds capability and switches no caller: hq's own filesystem reads
 * are untouched by the change that introduced it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LOCATION_FILE_METHODS,
  LOCATION_SEED_MAX_BYTES,
  LOCATION_SEED_MAX_FILES,
  LocationFileError,
  type LocationSeedFile,
} from '@agenthix/core'

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

// Where a location lives is storageSite's own suite; here it is one site.
const resolveStorageSite = vi.hoisted(() => vi.fn())
vi.mock('../storageSite', () => ({ resolveStorageSite }))

import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { ContentStreamFailed } from '../../sites/content/contentStream'
import {
  listFilesOnSite,
  statFileOnSite,
  readFileOnSite,
  seedFilesOnSite,
  ensureDirOnSite,
  removeLocationOnSite,
} from '../locationFileStore'

const loc = { ownerType: 'project' as const, ownerId: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  resolveStorageSite.mockResolvedValue('site-logical-1')
})

describe('the control-channel calls', () => {
  it('lists a location through the site that holds it', async () => {
    request.mockResolvedValue({ entries: [{ name: 'ROADMAP.md', kind: 'file', size: 12 }] })
    const result = await listFilesOnSite(loc, 'history')
    expect(resolveStorageSite).toHaveBeenCalledWith(loc)
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.listFiles, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
      subPath: 'history',
    })
    expect(result.entries[0]?.name).toBe('ROADMAP.md')
  })

  it('stats one entry', async () => {
    request.mockResolvedValue({ name: 'a.md', kind: 'file', size: 3, modifiedAt: '2026-01-01T00:00:00.000Z' })
    await statFileOnSite({ ...loc, workspaceId: 'w1' }, 'a.md')
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.statFile, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1', taskId: null },
      relPath: 'a.md',
    })
  })

  it('seeds a location', async () => {
    request.mockResolvedValue({ written: ['ROADMAP.md'], skipped: [] })
    const files: LocationSeedFile[] = [{ relPath: 'ROADMAP.md', content: '# R\n', ifAbsent: true }]
    expect(await seedFilesOnSite(loc, files)).toEqual({ written: ['ROADMAP.md'], skipped: [] })
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.seedFiles, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
      files,
    })
  })

  it('ensures a directory', async () => {
    request.mockResolvedValue({ created: true })
    expect(await ensureDirOnSite({ ...loc, taskId: 't1' })).toEqual({ created: true })
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.ensureDir, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: 't1' },
      subPath: null,
    })
  })

  it('removes a location through the site that holds it', async () => {
    request.mockResolvedValue({ removed: true })
    expect(await removeLocationOnSite({ ...loc, workspaceId: 'w1' })).toEqual({ removed: true })
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.removeLocation, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1', taskId: null },
    })
  })

  it('removes a whole owner only when asked to, and says so on the wire', async () => {
    request.mockResolvedValue({ removed: true })
    await removeLocationOnSite(loc, { wholeOwner: true })
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.removeLocation, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
      wholeOwner: true,
    })
  })

  it('never sends wholeOwner unless the caller set it', async () => {
    request.mockResolvedValue({ removed: false })
    await removeLocationOnSite(loc)
    const [, , params] = request.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(params).not.toHaveProperty('wholeOwner')
  })

  // A project's site is read off the project's own row, which deleting the
  // project removes — so the caller resolves it first and hands it in.
  it('uses a site the caller already resolved, without asking where the location lives', async () => {
    request.mockResolvedValue({ removed: true })
    await removeLocationOnSite(loc, { wholeOwner: true, logicalSiteId: 'site-kept' })
    expect(resolveStorageSite).not.toHaveBeenCalled()
    expect(request.mock.calls[0]![0]).toBe('site-kept')
  })

  // A caller holds a Prisma row, or a target carrying a name and a site id.
  // Site validates strictly and refuses an unexpected field, so only the four
  // location fields ever cross.
  it('sends only the four location fields, whatever else the caller was holding', async () => {
    request.mockResolvedValue({ entries: [] })
    await listFilesOnSite({ ...loc, name: 'Apollo', siteId: 's9' } as never)
    const [, , params] = request.mock.calls[0] as [string, string, { loc: Record<string, unknown> }]
    expect(Object.keys(params.loc).sort()).toEqual(['ownerId', 'ownerType', 'taskId', 'workspaceId'])
  })
})

/**
 * The site's own refusals arrive as one string on either transport. hq reads
 * the code out of it rather than matching on prose, so a caller can tell "not
 * found" from "refused" without a regex over an error message.
 */
describe('a refusal from the site', () => {
  it('comes back as a typed error carrying the site\'s code', async () => {
    const wire = new LocationFileError('not_found', 'location.statFile "a.md" in project p1').message
    request.mockRejectedValue(new ChannelRequestFailed(wire, 'handler_failed'))
    const err = await statFileOnSite(loc, 'a.md').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LocationFileError)
    expect((err as LocationFileError).code).toBe('not_found')
  })

  it('does the same for a failure on the content transport', async () => {
    const wire = new LocationFileError('refused', 'location.readFile "a.md" in project p1').message
    openContentStream.mockRejectedValue(new ContentStreamFailed(wire, 'handler_failed'))
    const err = await readFileOnSite(loc, 'a.md').catch((e: unknown) => e)
    expect((err as LocationFileError).code).toBe('refused')
  })

  it('leaves a failure that is not one of ours exactly as it came', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('something else broke', 'handler_failed'))
    const err = await listFilesOnSite(loc).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChannelRequestFailed)
    expect(err).not.toBeInstanceOf(LocationFileError)
  })
})

/**
 * The seed bounds are the site's rule, and hq applies them too. A cap only the
 * receiver enforces means hq discovers it by being refused — after it has
 * already put the payload on the wire.
 */
describe('the seed bounds, before the call', () => {
  it('refuses too many files without asking the site', async () => {
    const files: LocationSeedFile[] = Array.from({ length: LOCATION_SEED_MAX_FILES + 1 }, (_, i) => ({ relPath: `f${i}.md`, content: '', ifAbsent: true }))
    const err = await seedFilesOnSite(loc, files).catch((e: unknown) => e)
    expect((err as LocationFileError).code).toBe('too_many')
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses too many bytes without asking the site', async () => {
    const files: LocationSeedFile[] = [{ relPath: 'huge.md', content: 'x'.repeat(LOCATION_SEED_MAX_BYTES + 1), ifAbsent: true }]
    const err = await seedFilesOnSite(loc, files).catch((e: unknown) => e)
    expect((err as LocationFileError).code).toBe('too_large')
    expect(request).not.toHaveBeenCalled()
  })

  it('lets a real seed through', async () => {
    request.mockResolvedValue({ written: ['ROADMAP.md'], skipped: [] })
    await seedFilesOnSite(loc, [{ relPath: 'ROADMAP.md', content: '# R\n', ifAbsent: true }])
    expect(request).toHaveBeenCalledOnce()
  })
})
