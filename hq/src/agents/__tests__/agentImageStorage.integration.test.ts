/**
 * An agent's avatar and cover are hq's own data about an agent — nothing a run
 * reads — so they are written to, and opened from, storage of hq's own rather
 * than a site's disk (close-out spec §6.5).
 *
 * Against a real filesystem: the upload path and the access
 * check hq makes before signing a ticket all run for real, with two roots side by side (hq's own storage and a
 * site's) so "landed in hq's storage" and "left the site's disk alone" are both
 * observed rather than assumed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'


vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { smallPictureName } from '../../shared/pictures/files'
import { uploadAgentImage } from '../actions'
import { generateAgentPictureOp } from '../../server/controlplane/agentOps'
import { uploadAccess } from '../../server/files/uploadAccess'
import { getAgentImagesDir, getHqStorageRoot } from '../../server/hqStoragePaths'
import { contextWithRole } from './definitionFixtures'
import type { CallerContext } from '../../server/controlplane/types'
import { claims } from '../../server/controlplane/__tests__/controlPlaneFixtures'

/** An ADMIN's own Chat: a run's authority is the person it is for, read from the database (adr-0101). */
async function adminChat(): Promise<CallerContext> {
  const { user } = await contextWithRole('ADMIN')
  const agent = await createAgent()
  const session = await prisma.agentSession.create({ data: { userId: user.id, agentId: agent.id, sessionType: 'chat' } })
  return { kind: 'run', claims: claims({ userId: user.id, role: 'ADMIN', projectId: null, taskId: null, sessionId: session.id, agentId: agent.id, runner: { kind: 'person', userId: user.id } }) }
}

// 1x1 transparent PNG as a data URL, and the bytes it carries.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64')

const savedSiteRoot = process.env.SITE_ROOT
const savedHqStorageRoot = process.env.HQ_STORAGE_ROOT
const savedHqAssetsRoot = process.env.HQ_ASSETS_ROOT
let sandbox: string
let site: string
let outside: string

const adminCtx = async () => (await contextWithRole('ADMIN')).ctx
const avatarOf = async (id: string) => (await prisma.agent.findUniqueOrThrow({ where: { id } })).avatarUrl


/** Whether hq would sign a ticket for a signed-in person to open the agent's image: 200, or the refusal's status. */
async function opening(agentId: string, filename: string): Promise<number> {
  const access = await uploadAccess(`/agents/${agentId}/images/${filename}`, 'usr_signed_in')
  return access.ok ? 200 : access.status
}

async function write(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf-8')
}

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  async function walk(d: string) {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      const rel = path.relative(dir, full)
      if (entry.isDirectory()) {
        out[`${rel}/`] = ''
        await walk(full)
      } else if (entry.isSymbolicLink()) {
        out[`${rel}->`] = await fs.readlink(full)
      } else {
        out[rel] = await fs.readFile(full, 'utf-8')
      }
    }
  }
  await walk(dir)
  return out
}

/** The one file name in an agent's image directory, or null when there is none. */
async function storedImages(agentId: string): Promise<string[]> {
  try {
    return (await fs.readdir(getAgentImagesDir(agentId))).sort()
  } catch {
    return []
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-image-storage-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-image-outside-'))
  site = path.join(sandbox, 'site')
  process.env.SITE_ROOT = site
  process.env.HQ_STORAGE_ROOT = path.join(sandbox, 'hq-storage')
  process.env.HQ_ASSETS_ROOT = path.join(sandbox, 'hq-assets')

  // The agent's own directory on a site's disk — the place these images used to
  // be written to. Present so that "the site's disk is untouched" is a
  // comparison against something real rather than against an absent tree.
  await write(path.join(site, 'agents', 'dev', 'workspace', '.private', 'memory', 'note.md'), '# note')
  await write(path.join(outside, 'planted.txt'), 'OUTSIDE')

  await createAgent({ id: 'dev-id', handle: 'dev' })
  // 'escaper' names an id that climbs out of hq's storage — the traversal an agent id can carry into the destination path.
  await createAgent({ id: '../../escaped', handle: 'escaper' })
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const [key, value] of [['SITE_ROOT', savedSiteRoot], ['HQ_STORAGE_ROOT', savedHqStorageRoot], ['HQ_ASSETS_ROOT', savedHqAssetsRoot]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(sandbox, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('an uploaded avatar lands in hq\'s own storage @SC-2008 @SC-2011', () => {
  it('writes the picture and its small copy under hq\'s storage root and leaves the site\'s disk alone', async () => {
    const siteBefore = await snapshot(site)
    expect(siteBefore['agents/dev/workspace/.private/memory/note.md']).toBe('# note')

    const result = await uploadAgentImage({ agentId: 'dev-id', type: 'avatar', dataUrl: PNG_DATA_URL }, await adminCtx())

    const filename = result.url.split('/').pop()!
    expect(await storedImages('dev-id')).toEqual([filename, smallPictureName(filename)].sort())
    // And it is the configured root the file landed under, not a path that
    // merely descends from the helper: HQ_STORAGE_ROOT is what moved it here.
    expect(await snapshot(process.env.HQ_STORAGE_ROOT!)).toMatchObject({
      [path.join('agents', 'dev-id', 'images', filename)]: expect.anything(),
    })
    expect(await snapshot(site)).toEqual(siteBefore)
    expect(await avatarOf('dev-id')).toBe(result.url)
  })

  it('opens it with no site disk present at all', async () => {
    const result = await uploadAgentImage({ agentId: 'dev-id', type: 'cover', dataUrl: PNG_DATA_URL }, await adminCtx())
    const filename = result.url.split('/').pop()!
    // Opening must not depend on the site's disk being there — which is the
    // whole of what this move is for, and the one thing a round trip against a
    // colocated disk cannot tell apart on its own.
    await fs.rm(site, { recursive: true, force: true })

    expect(await opening('dev-id', filename)).toBe(200)
  })

  it('opens an image hq\'s storage holds', async () => {
    await fs.mkdir(getAgentImagesDir('dev-id'), { recursive: true })
    await fs.writeFile(path.join(getAgentImagesDir('dev-id'), 'held.png'), PNG_BYTES)

    expect(await opening('dev-id', 'held.png')).toBe(200)
  })

  it('opens no image hq\'s storage does not hold (404)', async () => {
    expect(await opening('dev-id', 'nothing-here.png')).toBe(404)
  })

  it('refuses to open a path that climbs out of hq\'s storage', async () => {
    const parent = path.dirname(getHqStorageRoot())
    await write(path.join(parent, 'images', 'sneak.png'), 'NOT-AN-AVATAR')
    expect(await opening('../..', 'sneak.png')).toBe(404)
  })
})

describe('an upload whose destination leaves hq\'s storage is refused @SC-2008', () => {
  it('refuses a traversal in the destination and writes nothing outside', async () => {
    const before = await snapshot(sandbox)
    await expect(
      uploadAgentImage({ agentId: '../../escaped', type: 'avatar', dataUrl: PNG_DATA_URL }, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(await snapshot(sandbox)).toEqual(before)
    expect(await avatarOf('../../escaped')).toBeNull()
  })

  it('refuses when a link stands in for the agent\'s image directory', async () => {
    await fs.mkdir(path.dirname(getAgentImagesDir('dev-id')), { recursive: true })
    await fs.symlink(outside, getAgentImagesDir('dev-id'))
    const outsideBefore = await snapshot(outside)
    expect(outsideBefore['planted.txt']).toBe('OUTSIDE')

    await expect(
      uploadAgentImage({ agentId: 'dev-id', type: 'avatar', dataUrl: PNG_DATA_URL }, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 403 })

    expect(await snapshot(outside)).toEqual(outsideBefore)
  })

  // Both link shapes, because they fail different checks: an absolute one is
  // visibly elsewhere, a relative one spells a path that stays inside the tree
  // until it is followed.
  it.each(['absolute', 'relative'] as const)('refuses to open through an %s link that leaves hq\'s storage', async (kind) => {
    const images = getAgentImagesDir('dev-id')
    await fs.mkdir(images, { recursive: true })
    await write(path.join(outside, 'secret.png'), 'HOST-SECRET')
    const target = path.join(outside, 'secret.png')
    await fs.symlink(kind === 'absolute' ? target : path.relative(images, target), path.join(images, 'linked.png'))

    expect(await opening('dev-id', 'linked.png')).toBe(404)
  })
})

describe('a picture an agent makes lands in the same storage @SC-2008', () => {
  it("writes it and its small copy into hq's own storage, never the site's", async () => {
    const siteBefore = await snapshot(site)
    const result = await generateAgentPictureOp(await adminChat(), { agentId: 'dev-id', imageType: 'cover' })

    const filename = (result.url as string).split('/').pop()!
    expect((await fs.readdir(getAgentImagesDir('dev-id'))).sort()).toEqual(expect.arrayContaining([filename, smallPictureName(filename)]))
    expect(await snapshot(site)).toEqual(siteBefore)
  })

  it("refuses an agent id that would climb out of hq's storage, writing nothing", async () => {
    const before = await snapshot(sandbox)
    await expect(
      generateAgentPictureOp(await adminChat(), { agentId: '../../escaped', imageType: 'avatar' }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(await snapshot(sandbox)).toEqual(before)
  })
})
