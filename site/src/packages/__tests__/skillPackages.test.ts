/** A skill's delivered content in the package cache (security review L4): bounded, and out of every container's reach. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES } from '@agenthix/core'
import { getPackageCacheRoot, hasPackage, storeVerifiedPackage, PackageVerificationError } from '../packageCache'
import { makeTransfer } from './transferFixture'
import { resolveBoundaryMount } from '../../agents/runtime/locationResolver'
import { getSiteRoot } from '../../agents/agentDiskPaths'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skill-pkg-')))
  process.env.SITE_ROOT = root
})
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe("a skill's content in the package cache @security-L4 @SC-1604", () => {
  it('is stored when it is a skill within the bounds', async () => {
    const { ref, body } = makeTransfer('skill', 'v1', { 'SKILL.md': 'x', 'scripts/a.sh': 'a' })
    await storeVerifiedPackage(ref, body)
    expect(await hasPackage(ref)).toBe(true)
  })

  it('counts the skill\'s own folder and its folders as staging does, and allows the depth staging allows', async () => {
    const inFolder = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`a/f${i}.md`, 'x']))
    const fits = makeTransfer('skill', 'fits', { 'SKILL.md': 'x', ...inFolder(SKILL_TREE_MAX_ENTRIES - 3) })
    await storeVerifiedPackage(fits.ref, fits.body)
    expect(await hasPackage(fits.ref)).toBe(true)

    const over = makeTransfer('skill', 'over', { 'SKILL.md': 'x', ...inFolder(SKILL_TREE_MAX_ENTRIES - 2) })
    await expect(storeVerifiedPackage(over.ref, over.body)).rejects.toBeInstanceOf(PackageVerificationError)

    const nested = `${Array.from({ length: SKILL_TREE_MAX_DEPTH }, (_, i) => `d${i}`).join('/')}/x.md`
    const deep = makeTransfer('skill', 'deep', { 'SKILL.md': 'x', [nested]: 'x' })
    await storeVerifiedPackage(deep.ref, deep.body)
    expect(await hasPackage(deep.ref)).toBe(true)
  })

  it('is refused with too many files, folders too deep, no SKILL.md, or names one disk would store as one', async () => {
    const many = Object.fromEntries(Array.from({ length: SKILL_TREE_MAX_ENTRIES }, (_, i) => [`f${i}.md`, 'x']))
    const deep = `${Array.from({ length: SKILL_TREE_MAX_DEPTH + 1 }, (_, i) => `d${i}`).join('/')}/x.md`
    for (const files of <Record<string, string>[]>[
      { 'SKILL.md': 'x', ...many },
      { 'SKILL.md': 'x', [deep]: 'x' },
      { 'README.md': 'x' },
      { 'SKILL.md': 'x', 'Notes.md': 'a', 'notes.md': 'b' },
    ]) {
      const { ref, body } = makeTransfer('skill', 'v1', files)
      await expect(storeVerifiedPackage(ref, body)).rejects.toBeInstanceOf(PackageVerificationError)
      expect(await hasPackage(ref)).toBe(false)
    }
  })

  it('leaves other kinds of package as they were', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    await storeVerifiedPackage(ref, body)
    expect(await hasPackage(ref)).toBe(true)
  })

  it('sits outside every folder a container binds', () => {
    const cache = getPackageCacheRoot()
    for (const ownerType of ['project', 'user'] as const) {
      const bound = resolveBoundaryMount({ ownerType, ownerId: 'x' }, getSiteRoot()).hostDir
      expect(cache.startsWith(`${path.dirname(bound)}/`)).toBe(false)
    }
    expect(path.relative(getSiteRoot(), cache)).toBe('packages')
  })
})
