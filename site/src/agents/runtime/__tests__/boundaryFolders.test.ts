import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boundaryFolderPaths, prepareBoundaryFolders } from '../boundaryFolders'
import type { AgentMounts } from '../containerTypes'

let root: string
beforeEach(async () => { root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'boundary-folders-'))) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

function mounts(folders: string[], readOnly: string[]): AgentMounts {
  const hostDir = path.join(root, 'projects', 'p1')
  return {
    boundary: { hostDir, containerDir: '/projects/p1' },
    folders: folders.map(f => ({ hostDir: path.join(hostDir, f), containerDir: `/projects/p1/${f}` })),
    locationMode: 'rw',
    readOnly: readOnly.map(w => ({ hostDir: path.join(root, 'code', 'projects', 'p1', w), containerDir: `/projects/p1/workspaces/${w}` })),
  }
}

describe("the boundary's folders, made by the site before Docker sees them @SC-2194", () => {
  it("are the folders the prompt lists and the mount point of each bind inside the boundary's", () => {
    expect(boundaryFolderPaths(mounts(['files'], ['w1']))).toEqual(['files', path.join('workspaces', 'w1')])
  })

  it('never name a place outside the boundary, nor list one twice', () => {
    const m = mounts(['files', 'workspaces/w1'], ['w1'])
    m.readOnly!.push({ hostDir: '/elsewhere', containerDir: '/projects/other' })
    expect(boundaryFolderPaths(m)).toEqual(['files', path.join('workspaces', 'w1')])
  })

  // On Linux, Docker makes a missing mount point of a bind nested in another root-owned on the machine, and the site
  // (uid 1001) then cannot remove the workspace's folder, nor make another beside it: made first, it is the site's.
  it("makes each code workspace's mount point, though the prompt lists no folder for it", async () => {
    await prepareBoundaryFolders(mounts([], ['w1']))
    expect((await fs.stat(path.join(root, 'projects', 'p1', 'workspaces', 'w1'))).isDirectory()).toBe(true)
  })
})
