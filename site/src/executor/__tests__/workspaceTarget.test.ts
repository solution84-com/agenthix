/**
 * The workspace a workflow run snapshots and writes back (adr-0173): a repository workspace's `main` from the code
 * space, any other folder opened from the boundary's own folder down, never through a symbolic link a run put there.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#db', () => ({
  prisma: { workspace: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, ownerType: 'project', ownerId: 'p1' })) } },
}))

import { resolveWorkspaceTarget } from '../workspaceTarget'
import { takeSnapshot } from '../snapshot'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ws-target-')))
  process.env.SITE_ROOT = root
})
afterEach(async () => {
  delete process.env.SITE_ROOT
  await fs.rm(root, { recursive: true, force: true })
})

const target = (workspaceId: string | null) => resolveWorkspaceTarget({ ownerType: 'project', ownerId: 'p1', workspaceId })

describe('the workspace a workflow run works on', () => {
  it("is a repository workspace's main in the code space", async () => {
    const main = path.join(root, 'code', 'projects', 'p1', 'w1')
    await fs.mkdir(path.join(main, '.git'), { recursive: true })
    expect(await target('w1')).toMatchObject({ hostDir: main, root: main, containerDir: '/projects/p1/workspaces/w1' })
  })

  it('is opened from the boundary down, so a workspaces folder a run replaced with a link is not followed', async () => {
    const other = path.join(root, 'projects', 'p2', 'workspaces')
    await fs.mkdir(path.join(other, 'w2'), { recursive: true })
    await fs.writeFile(path.join(other, 'w2', 'secret.txt'), 'p2 only')
    await fs.mkdir(path.join(root, 'projects', 'p1'), { recursive: true })
    await fs.symlink(other, path.join(root, 'projects', 'p1', 'workspaces'))
    expect(await target('w2')).toBeNull()
  })

  it('snapshots a plain workspace through its open folders', async () => {
    const ws = path.join(root, 'projects', 'p1', 'workspaces', 'w3')
    await fs.mkdir(ws, { recursive: true })
    await fs.writeFile(path.join(ws, 'a.txt'), 'a')
    const t = await target('w3')
    expect(t?.root).toEqual({ base: path.join(root, 'projects', 'p1'), rel: 'workspaces/w3' })
    const snap = await takeSnapshot(t!.root, path.join(root, 'snap'))
    expect([...snap.manifest.keys()]).toContain('a.txt')
  })
})
