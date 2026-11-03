/**
 * The folder a Claude sign-in binds as Claude's: Docker finds a bind's source
 * on the machine, so it must be under the site's data folder (seen at the same
 * path inside the site's container and out), and only the site's user may open
 * it while it holds a person's tokens.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearSignInScratch, makeSignInScratch, signInScratchRoot } from '../claudeLogin'

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
})
afterEach(async () => {
  delete process.env.SITE_ROOT
  await fs.rm(root, { recursive: true, force: true })
})

describe('the sign-in scratch folder', () => {
  it("is made under the site's data folder, not the system's temporary folder", async () => {
    const dir = await makeSignInScratch()
    expect(path.dirname(dir)).toBe(path.join(root, 'sign-ins'))
    expect(signInScratchRoot()).toBe(path.join(root, 'sign-ins'))
    expect(dir.startsWith(os.tmpdir() + path.sep + 'agenthix-claude-login-')).toBe(false)
  })

  it("is open to the site's own user only, and so is the folder holding it", async () => {
    const dir = await makeSignInScratch()
    expect((await fs.stat(dir)).mode & 0o777).toBe(0o700)
    expect((await fs.stat(signInScratchRoot())).mode & 0o777).toBe(0o700)
  })

  it('gives every sign-in a folder of its own', async () => {
    expect(await makeSignInScratch()).not.toBe(await makeSignInScratch())
  })

  it('a sign-in the site never saw end leaves nothing behind once the site starts again', async () => {
    const dir = await makeSignInScratch()
    await fs.writeFile(path.join(dir, '.credentials.json'), '{}')
    await clearSignInScratch()
    await expect(fs.stat(signInScratchRoot())).rejects.toMatchObject({ code: 'ENOENT' })
    await clearSignInScratch()
  })
})
