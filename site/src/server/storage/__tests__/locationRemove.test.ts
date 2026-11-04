/**
 * `location.remove` — the one handler that deletes recursively, so it is tested
 * against the ways a delete goes wrong: a path that climbs out, a link that
 * carries it elsewhere, an id that names more than one owner.
 *
 * Real directories under a temporary storage root, the way the other location
 * handler tests work — a mocked `fs` would prove nothing about where `rm` lands.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LOCATION_FILE_METHODS, LocationFileError, type LocationRemoveParams } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { removeLocation, REMOVE_LOCATION_PARAMS_SHAPE } from '../locationRemove'
import { channelMethods } from '../../hq/channelMethods'
import { getCodeDir, getKnowledgeDir, locationDir, ownerDir } from '../paths'

let root: string
let outside: string
const savedSiteRoot = process.env.SITE_ROOT

const exists = (p: string) => fs.lstat(p).then(() => true, () => false)

async function seedProject(id: string) {
  const owner = ownerDir('project', id)
  await fs.mkdir(path.join(owner, 'files', 'history'), { recursive: true })
  await fs.mkdir(path.join(owner, 'knowledge'), { recursive: true })
  await fs.mkdir(path.join(owner, 'artefacts', 'set-1'), { recursive: true })
  await fs.mkdir(path.join(owner, 'workspaces', 'ws-1'), { recursive: true })
  await fs.mkdir(path.join(owner, 'tasks', 't-1'), { recursive: true })
  await fs.writeFile(path.join(owner, 'files', 'ROADMAP.md'), '# roadmap\n')
  await fs.writeFile(path.join(owner, 'workspaces', 'ws-1', 'a.txt'), 'a')
  return owner
}

async function refusalOf(params: unknown): Promise<LocationFileError> {
  try {
    await removeLocation(params)
  } catch (err) {
    expect(err).toBeInstanceOf(LocationFileError)
    return err as LocationFileError
  }
  throw new Error('expected a refusal')
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  await fs.writeFile(path.join(outside, 'precious.txt'), 'keep me')
  process.env.SITE_ROOT = root
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('location.remove — a whole owner', () => {
  it('deletes the owner\'s entire storage directory and says it did', async () => {
    const owner = await seedProject('proj-1')
    expect(await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true })).toEqual({ removed: true })
    expect(await exists(owner)).toBe(false)
  })

  it('deletes the owner\'s knowledge too, which lives outside its folder @SC-1384', async () => {
    await seedProject('proj-1')
    const knowledge = getKnowledgeDir('project', 'proj-1')
    await fs.mkdir(path.join(knowledge, 'pages', 'processes'), { recursive: true })
    await fs.writeFile(path.join(knowledge, 'pages', 'processes', 'release.md'), '# release\n')
    const other = getKnowledgeDir('project', 'proj-2')
    await fs.mkdir(path.join(other, 'pages'), { recursive: true })
    expect(await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true })).toEqual({ removed: true })
    expect(await exists(knowledge)).toBe(false)
    expect(await exists(other)).toBe(true)
  })

  it("deletes the owner's code space too, where its repositories' main lives (adr-0173)", async () => {
    await seedProject('proj-1')
    const main = getCodeDir({ ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' })
    const other = getCodeDir({ ownerType: 'project', ownerId: 'proj-2', workspaceId: 'ws-9' })
    for (const d of [main, other]) await fs.mkdir(path.join(d, '.git'), { recursive: true })
    expect(await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true })).toEqual({ removed: true })
    expect(await exists(main)).toBe(false)
    expect(await exists(other)).toBe(true)
  })

  it('leaves every other owner alone', async () => {
    await seedProject('proj-1')
    const other = await seedProject('proj-2')
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true })
    expect(await exists(path.join(other, 'files', 'ROADMAP.md'))).toBe(true)
    expect(await exists(path.dirname(other))).toBe(true)
  })

  it('is idempotent — a second call finds nothing and still succeeds', async () => {
    await seedProject('proj-1')
    const params = { loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true }
    await removeLocation(params)
    expect(await removeLocation(params)).toEqual({ removed: false })
  })

  it('answers removed: false for an owner that never had any storage', async () => {
    expect(await removeLocation({ loc: { ownerType: 'project', ownerId: 'never-existed' }, wholeOwner: true })).toEqual({ removed: false })
  })

  it('refuses a location that names a workspace or task, since the owner is the target', async () => {
    const owner = await seedProject('proj-1')
    const err = await refusalOf({ loc: { ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' }, wholeOwner: true })
    expect(err.code).toBe('invalid')
    expect(await exists(owner)).toBe(true)
  })
})

describe('location.remove — one location', () => {
  it('deletes a workspace directory and nothing beside it', async () => {
    const owner = await seedProject('proj-1')
    const result = await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' } })
    expect(result).toEqual({ removed: true })
    expect(await exists(path.join(owner, 'workspaces', 'ws-1'))).toBe(false)
    expect(await exists(path.join(owner, 'files', 'ROADMAP.md'))).toBe(true)
  })

  it("deletes a repository workspace's main in the code space with it", async () => {
    await seedProject('proj-1')
    const main = getCodeDir({ ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' })
    await fs.mkdir(path.join(main, '.git'), { recursive: true })
    expect(await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' } })).toEqual({ removed: true })
    expect(await exists(main)).toBe(false)
  })

  it('deletes a task directory', async () => {
    const owner = await seedProject('proj-1')
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1', taskId: 't-1' } })
    expect(await exists(path.join(owner, 'tasks', 't-1'))).toBe(false)
    expect(await exists(path.join(owner, 'tasks'))).toBe(true)
  })

  it('deletes only the files directory for an owner-only location, not the owner\'s other storage', async () => {
    const owner = await seedProject('proj-1')
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' } })
    expect(await exists(locationDir({ ownerType: 'project', ownerId: 'proj-1' }))).toBe(false)
    expect(await exists(path.join(owner, 'knowledge'))).toBe(true)
    expect(await exists(path.join(owner, 'workspaces', 'ws-1', 'a.txt'))).toBe(true)
  })

  it('is idempotent for a location that is already gone', async () => {
    await seedProject('proj-1')
    const params = { loc: { ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' } }
    await removeLocation(params)
    expect(await removeLocation(params)).toEqual({ removed: false })
  })
})

describe('location.remove — it cannot delete outside the storage root or beyond the named owner', () => {
  it.each(['.', '..', '../elsewhere', 'a/b', 'a\\b', '/etc', '', '.hidden'])('refuses %j as an owner id at the wire', async (ownerId) => {
    await seedProject('proj-1')
    const err = await refusalOf({ loc: { ownerType: 'project', ownerId }, wholeOwner: true })
    expect(err.code).toBe('invalid')
    // Nothing was touched: the projects directory and its one project are still there.
    expect(await exists(path.join(ownerDir('project', 'proj-1'), 'files', 'ROADMAP.md'))).toBe(true)
  })

  it.each(['.', '..', '../x', 'a/b'])('refuses %j as a workspace id, which would name the directory above it', async (workspaceId) => {
    const owner = await seedProject('proj-1')
    const err = await refusalOf({ loc: { ownerType: 'project', ownerId: 'proj-1', workspaceId } })
    expect(err.code).toBe('invalid')
    expect(await exists(path.join(owner, 'workspaces', 'ws-1', 'a.txt'))).toBe(true)
  })

  it('refuses an owner directory that is a symlink pointing outside the root, leaving the target intact', async () => {
    await fs.mkdir(path.dirname(ownerDir('project', 'linked')), { recursive: true })
    await fs.symlink(outside, ownerDir('project', 'linked'))
    const err = await refusalOf({ loc: { ownerType: 'project', ownerId: 'linked' }, wholeOwner: true })
    expect(err.code).toBe('outside')
    expect(await fs.readFile(path.join(outside, 'precious.txt'), 'utf8')).toBe('keep me')
  })

  it('refuses when the owner-kind directory itself is a symlink out of the root', async () => {
    await fs.mkdir(path.join(outside, 'proj-9', 'files'), { recursive: true })
    await fs.symlink(outside, path.join(root, 'projects'))
    const err = await refusalOf({ loc: { ownerType: 'project', ownerId: 'proj-9' }, wholeOwner: true })
    expect(err.code).toBe('outside')
    expect(await exists(path.join(outside, 'proj-9', 'files'))).toBe(true)
  })

  it('removes a link planted inside a location as a link, never following it to what it points at', async () => {
    const owner = await seedProject('proj-1')
    await fs.symlink(outside, path.join(owner, 'files', 'escape'))
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true })
    expect(await exists(owner)).toBe(false)
    expect(await fs.readFile(path.join(outside, 'precious.txt'), 'utf8')).toBe('keep me')
  })

  it('does the same when only the one location is removed', async () => {
    const owner = await seedProject('proj-1')
    await fs.symlink(outside, path.join(owner, 'workspaces', 'ws-1', 'escape'))
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' } })
    expect(await fs.readFile(path.join(outside, 'precious.txt'), 'utf8')).toBe('keep me')
  })

  it('never names a path on the site\'s disk in a refusal', async () => {
    await fs.mkdir(path.dirname(ownerDir('project', 'linked')), { recursive: true })
    await fs.symlink(outside, ownerDir('project', 'linked'))
    const err = await refusalOf({ loc: { ownerType: 'project', ownerId: 'linked' }, wholeOwner: true })
    expect(err.message).not.toContain(root)
    expect(err.message).not.toContain(outside)
  })
})

describe('location.remove — the wire', () => {
  it('is registered on the control channel under the name core publishes', () => {
    expect(LOCATION_FILE_METHODS.removeLocation).toBe('location.remove')
    expect(channelMethods[LOCATION_FILE_METHODS.removeLocation]).toBeTypeOf('function')
  })

  it('drops a field it does not declare, a caller included, and removes what the location names', async () => {
    const owner = await seedProject('proj-1')
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true, userId: 'u1', force: false })
    expect(await exists(owner)).toBe(false)
  })

  it('carries no caller in its params', () => {
    expect(Object.keys(REMOVE_LOCATION_PARAMS_SHAPE).sort()).toEqual(['loc', 'wholeOwner'])
    const wire: LocationRemoveParams = { loc: { ownerType: 'project', ownerId: 'p' }, wholeOwner: true }
    expect(Object.keys(wire)).not.toContain('userId')
  })

  it.each([
    ['a wholeOwner that is not literally true', { loc: { ownerType: 'project', ownerId: 'p' }, wholeOwner: false }],
    ['an owner kind that is not a storage owner', { loc: { ownerType: 'org', ownerId: 'p' } }],
    ['no params at all', undefined],
  ])('refuses %s, as a coded invalid', async (_label, params) => {
    const err = await refusalOf(params)
    expect(err.code).toBe('invalid')
  })
})
