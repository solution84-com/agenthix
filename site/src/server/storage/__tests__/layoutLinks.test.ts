/**
 * A run mounts its owner's whole folder, so an agent can replace `files/`,
 * `workspaces/` or one workspace with a link — to another project's storage on
 * this site, or anywhere else. Nothing that resolves a location's directory may
 * then treat the link's target as the location.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('#db', () => ({ prisma: {} }))

import { listFiles, statFile } from '../locationFileMethods'
import { removeLocation } from '../locationRemove'
import { ownerDir } from '../paths'
import { resolveBoundaryOverrideDir } from '../../../packages/boundaryOverrides'
import { placeFilesHome, workspaceHome } from '../../../packages/placeSkillHomes'

const mine = { ownerType: 'project' as const, ownerId: 'proj-mine' }
const theirs = { ownerType: 'project' as const, ownerId: 'proj-theirs' }

let root: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  const other = ownerDir(theirs.ownerType, theirs.ownerId)
  await fs.mkdir(path.join(other, 'files', '.agents', 'agents', 'agent-1'), { recursive: true })
  await fs.mkdir(path.join(other, 'files', '.agents', 'skills'), { recursive: true })
  await fs.writeFile(path.join(other, 'files', 'secret-plan.md'), 'theirs')
  await fs.mkdir(path.join(other, 'workspaces', 'ws-1'), { recursive: true })
  await fs.writeFile(path.join(other, 'workspaces', 'ws-1', 'keep.txt'), 'keep me')
  await fs.mkdir(ownerDir(mine.ownerType, mine.ownerId), { recursive: true })
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

const linkMine = (folder: string) =>
  fs.symlink(path.join(ownerDir(theirs.ownerType, theirs.ownerId), folder), path.join(ownerDir(mine.ownerType, mine.ownerId), folder))

describe('a location whose folder was replaced by a link', () => {
  it('refuses to list Files through a linked files folder', async () => {
    await linkMine('files')
    await expect(listFiles({ loc: mine })).rejects.toThrow(/outside/i)
    await expect(statFile({ loc: mine, relPath: 'secret-plan.md' })).rejects.toThrow(/outside/i)
  })

  it('refuses to list a workspace through a linked workspaces folder', async () => {
    await linkMine('workspaces')
    await expect(listFiles({ loc: { ...mine, workspaceId: 'ws-1' } })).rejects.toThrow(/outside/i)
  })

  it('reads no override or shared skills through a linked files folder', async () => {
    await linkMine('files')
    expect(await resolveBoundaryOverrideDir(mine, 'agent-1')).toBeNull()
    expect(await placeFilesHome(mine)).toBeNull()
  })

  it('reads no workspace skills through a linked workspaces folder', async () => {
    await linkMine('workspaces')
    expect(await workspaceHome(mine, 'ws-1')).toBeNull()
  })

  it('refuses to remove a workspace through a linked workspaces folder, and leaves the other one alone', async () => {
    await linkMine('workspaces')
    await expect(removeLocation({ loc: { ...mine, workspaceId: 'ws-1' } })).rejects.toThrow(/outside/i)
    expect(await fs.readFile(path.join(ownerDir(theirs.ownerType, theirs.ownerId), 'workspaces', 'ws-1', 'keep.txt'), 'utf8')).toBe('keep me')
  })

  it('still lists Files that are where the layout puts them', async () => {
    await fs.mkdir(path.join(ownerDir(mine.ownerType, mine.ownerId), 'files'))
    await fs.writeFile(path.join(ownerDir(mine.ownerType, mine.ownerId), 'files', 'ROADMAP.md'), '# r')
    const { entries } = await listFiles({ loc: mine })
    expect(entries.map(e => e.name)).toEqual(['ROADMAP.md'])
  })
})
