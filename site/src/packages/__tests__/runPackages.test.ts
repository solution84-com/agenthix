import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveRunPackageDirs } from '../runPackages'
import { storeVerifiedPackage, packageFilesDir, PackageUnavailableError } from '../packageCache'
import { makeTransfer } from './transferFixture'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-')); process.env.SITE_ROOT = root })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('resolveRunPackageDirs', () => {
  it('resolves every referenced package to its cached files', async () => {
    const agent = makeTransfer('agent', 'a1', { 'instructions.md': 'i' })
    const platform = makeTransfer('platform', 'platform', { 'skills/x/SKILL.md': 'x' })
    await storeVerifiedPackage(agent.ref, agent.body)
    await storeVerifiedPackage(platform.ref, platform.body)
    const refs = { agent: agent.ref, org: null, platform: platform.ref }
    expect(await resolveRunPackageDirs(refs)).toEqual({ refs, agentDir: packageFilesDir(agent.ref), orgDir: null, platformDir: packageFilesDir(platform.ref) })
  })

  it('fails naming the missing content rather than using any other content', async () => {
    const cached = makeTransfer('agent', 'a1', { 'instructions.md': 'old' })
    const wanted = makeTransfer('agent', 'a1', { 'instructions.md': 'new' })
    const platform = makeTransfer('platform', 'platform', {})
    await storeVerifiedPackage(cached.ref, cached.body)
    await storeVerifiedPackage(platform.ref, platform.body)
    await expect(resolveRunPackageDirs({ agent: wanted.ref, org: null, platform: platform.ref })).rejects.toBeInstanceOf(PackageUnavailableError)
  })
})
