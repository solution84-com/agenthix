import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'

vi.mock('wasp/server', () => ({ prisma: {} }))

const request = vi.hoisted(() => vi.fn())
const openContentStream = vi.hoisted(() => vi.fn())
vi.mock('../../../sites/channel', () => ({ siteChannelRegistry: { request } }))
vi.mock('../../../sites/content', async () => {
  const { ContentStreamFailed } = await import('../../../sites/content/contentStream')
  return { openContentStream, ContentStreamFailed }
})
vi.mock('../../../storage/storageSite', () => ({ resolveStorageSite: async () => 'site-1' }))
vi.mock('../../../storage/locationFileStore', async () => {
  const { LocationFileError } = await import('@agenthix/core')
  return {
    listFilesOnSite: vi.fn(), readFileOnSite: vi.fn(),
    translateFailure: async (_s: string, _m: string, err: unknown) => {
      const fromSite = err instanceof Error ? LocationFileError.fromWire(err.message) : null
      throw fromSite ?? err
    },
  }
})

import { LocationFileError, PACKAGE_FORMAT_VERSION, type LocationRef } from '@agenthix/core'
import { removeSkillFolder, writeSkillFolder } from '../siteSkills'
import { fingerprintOf } from '../../content'

const loc: LocationRef = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
const files = [{ path: 'SKILL.md', content: Buffer.from('---\nname: x\n---\n') }, { path: 'a/b.md', content: Buffer.from('b') }]
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** A stream the site ends once it has the body, or fails with `fail`. */
function fakeStream(fail?: Error) {
  const s = Object.assign(new EventEmitter(), {
    errored: null, destroyed: false, sent: null as Buffer | null,
    resume: () => {}, destroy: () => {},
    end(body: Buffer) {
      s.sent = body
      setImmediate(() => (fail ? s.emit('error', fail) : s.emit('end')))
    },
  })
  return s
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("writing a place's skill folder on its site @SC-1644", () => {
  it('streams every file with its contents entry, named by the fingerprint, for the place alone', async () => {
    const stream = fakeStream()
    openContentStream.mockResolvedValue(stream)
    await writeSkillFolder(loc, '.agents/skills/x', files)
    expect(openContentStream).toHaveBeenCalledWith('site-1', 'location.writeSkill', {
      loc, dir: '.agents/skills/x', digest: fingerprintOf(files),
    })
    expect(JSON.parse(stream.sent!.toString())).toEqual({
      contents: { formatVersion: PACKAGE_FORMAT_VERSION, files: files.map(f => ({ path: f.path, sha256: sha(f.content) })) },
      data: { 'SKILL.md': files[0].content.toString('base64'), 'a/b.md': 'Yg==' },
    })
  })

  it('never asks for a workspace\'s folder, or any path that is not a place\'s skill folder', async () => {
    for (const [at, dir] of [[{ ...loc, workspaceId: 'w1' }, '.agents/skills/x'], [loc, '.claude/skills/x'], [loc, '.agents/skills/../x']] as const) {
      await expect(writeSkillFolder(at, dir, files)).rejects.toThrow(/Nothing was changed\.$/)
      await expect(removeSkillFolder(at, dir)).rejects.toThrow(/Nothing was changed\.$/)
    }
    expect(openContentStream).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it("turns the site's refusal into one a person can act on, without the site's own words", async () => {
    openContentStream.mockResolvedValue(fakeStream(new Error(new LocationFileError('refused', 'location.writeSkill ".agents/skills/x" in project p1: a link').message)))
    const err = await writeSkillFolder(loc, '.agents/skills/x', files).catch(e => e)
    expect(err.status).toBe(409)
    expect(err.message).toMatch(/link.*Nothing was changed\.$/)
    expect(err.message).not.toMatch(/location-file/)
  })
})

describe("removing a place's skill folder on its site @SC-1647", () => {
  it('asks the site to remove that folder of the place', async () => {
    request.mockResolvedValue({ removed: true })
    await removeSkillFolder(loc, '.agents/agents/a1/skills/x')
    expect(request).toHaveBeenCalledWith('site-1', 'location.removeSkill', { loc, dir: '.agents/agents/a1/skills/x' })
  })
})
