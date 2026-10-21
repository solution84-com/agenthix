/**
 * Seeding a new location's files crosses the channel.
 *
 * hq decides what a new project starts with — the documents are string
 * literals in hq's own code, and the site writes what it is given. Sending a
 * template name instead would put that decision on the site and leave two
 * places to change it.
 *
 * Four properties, pinned rather than read off the code:
 *
 *  1. **The content crosses, not a path.** The site is asked for documents by
 *     their path relative to the location it was named, and it derives the
 *     rest — hq never says where anything sits on a site's disk.
 *  2. **Never-overwriting rides in the CALL.** `ifAbsent` travels on the wire,
 *     so provisioning a project twice stays idempotent whatever a handler is
 *     later changed to assume: "seed" and "overwrite" are one flag apart.
 *  3. **The files home is asked for first**, and nothing else: a new project
 *     is given no empty folder (there was a `history/` nothing used).
 *  4. **hq writes nothing to a site's disk.** `node:fs/promises` is mocked and
 *     asserted untouched, which is the whole point of the change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  seedFilesOnSite: vi.fn(),
  ensureDirOnSite: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: { mkdir: h.mkdir, writeFile: h.writeFile, access: h.access },
}))

vi.mock('../locationFileStore', () => ({
  seedFilesOnSite: h.seedFilesOnSite,
  ensureDirOnSite: h.ensureDirOnSite,
}))

import fs from 'node:fs/promises'
import { provisionProjectFiles } from '../filesService'

const projectId = 'proj-0001'
const location = { ownerType: 'project', ownerId: projectId }

/** The seed payload of the one `seedFilesOnSite` call this provisioning makes. */
function seededFiles(): { relPath: string; content: string; ifAbsent: true }[] {
  return h.seedFilesOnSite.mock.calls[0]![1]
}

beforeEach(() => {
  vi.clearAllMocks()
  h.seedFilesOnSite.mockResolvedValue({ written: [], skipped: [] })
  h.ensureDirOnSite.mockResolvedValue({ created: true })
})

describe("provisioning a new project's files @SC-239", () => {
  it('asks the site to create the documents, with their content', async () => {
    await provisionProjectFiles(projectId, 'Apollo')

    expect(h.seedFilesOnSite).toHaveBeenCalledWith(
      location,
      expect.arrayContaining([
        expect.objectContaining({ relPath: 'ROADMAP.md', content: expect.stringContaining('# Apollo — Roadmap') }),
        expect.objectContaining({ relPath: 'AGENTS.md', content: expect.stringContaining('Apollo') }),
      ]),
    )
  })

  it('never overwrites a document that already exists', async () => {
    await provisionProjectFiles(projectId, 'Apollo')

    // The site skips an existing file; assert the CALL says so rather than
    // assuming it, because "seed" and "overwrite" are one flag apart and the
    // idempotence of provisioning a project twice rests on this flag alone.
    expect(seededFiles().every((file) => file.ifAbsent === true)).toBe(true)
  })

  it('seeds AGENTS.md, the standard name for the instructions, and no PROJECT.md', async () => {
    await provisionProjectFiles(projectId, 'Apollo')

    expect(seededFiles().map((file) => file.relPath).sort()).toEqual(['AGENTS.md', 'ROADMAP.md'])
  })

  it('asks for the files home only, and no empty history folder', async () => {
    await provisionProjectFiles(projectId, 'Apollo')

    expect(h.ensureDirOnSite).toHaveBeenCalledTimes(1)
    expect(h.ensureDirOnSite).toHaveBeenCalledWith(location)
  })

  it("writes nothing to a site's disk from hq", async () => {
    await provisionProjectFiles(projectId, 'Apollo')

    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.mkdir).not.toHaveBeenCalled()
  })

  it('fails the provisioning when the site refuses, rather than reporting success', async () => {
    h.seedFilesOnSite.mockRejectedValue(new Error('Execution Site "local" is unreachable'))

    await expect(provisionProjectFiles(projectId, 'Apollo')).rejects.toThrow(/unreachable/)
  })
})
