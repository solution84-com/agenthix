import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __forgetBranchCopiesForTests, branchCopiesBytes, branchCopiesReport } from '../branchCopiesSize'

let root: string
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'copies-')); __forgetBranchCopiesForTests() })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('the disk branch copies use @SC-1730', () => {
  it('counts every owner\'s clones folder and nothing else, and follows no link', async () => {
    await mkdir(path.join(root, 'projects', 'p1', 'clones', 'c1'), { recursive: true })
    await mkdir(path.join(root, 'users', 'u1', 'clones', 'c2'), { recursive: true })
    await mkdir(path.join(root, 'projects', 'p1', 'workspaces', 'w'), { recursive: true })
    await writeFile(path.join(root, 'projects', 'p1', 'clones', 'c1', 'a'), Buffer.alloc(20_000))
    await writeFile(path.join(root, 'users', 'u1', 'clones', 'c2', 'b'), Buffer.alloc(20_000))
    await writeFile(path.join(root, 'projects', 'p1', 'workspaces', 'w', 'big'), Buffer.alloc(400_000))
    await symlink(path.join(root, 'projects', 'p1', 'workspaces', 'w', 'big'), path.join(root, 'projects', 'p1', 'clones', 'c1', 'link'))
    const bytes = await branchCopiesBytes(root)
    expect(bytes).toBeGreaterThanOrEqual(40_000)
    expect(bytes).toBeLessThan(100_000)
  })

  it('is zero with no storage and is reused for five minutes', async () => {
    expect(await branchCopiesBytes(path.join(root, 'none'))).toBe(0)
    let t = 0
    let calls = 0
    const count = async () => ++calls * 1000
    expect(await branchCopiesReport(root, () => t, count)).toEqual({ usedBytes: 1000 })
    t = 60_000
    expect(await branchCopiesReport(root, () => t, count)).toEqual({ usedBytes: 1000 })
    t = 301_000
    expect(await branchCopiesReport(root, () => t, count)).toEqual({ usedBytes: 2000 })
  })
})
