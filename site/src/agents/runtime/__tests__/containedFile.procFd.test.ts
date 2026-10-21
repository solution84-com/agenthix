import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// As on Linux (the site's container image), where the descriptor's real
// location is read from /proc/self/fd. The lookup itself is stubbed, so these
// tests mean the same thing on a macOS host, which has no /proc.
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  const platform = () => 'linux' as NodeJS.Platform
  return { ...actual, platform, default: { ...actual, platform } }
})

import { readContainedFile, writeContainedFile } from '../containedFile'

const LABEL = 'outside the storage this run works in'
let root: string
let readlink: MockInstance<typeof fs.readlink>

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'contained-procfd-')))
  await fs.writeFile(path.join(root, 'a.md'), 'inside', 'utf8')
  readlink = vi.spyOn(fs, 'readlink')
})

afterEach(async () => {
  readlink.mockRestore()
  await fs.rm(root, { recursive: true, force: true })
})

describe('the descriptor lookup on Linux', () => {
  it('reads and writes when the descriptor is inside the root', async () => {
    readlink.mockResolvedValue(path.join(root, 'a.md'))
    expect(await readContainedFile(root, 'a.md', LABEL)).toBe('inside')
    await writeContainedFile(root, 'a.md', 'changed', LABEL)
    expect(await fs.readFile(path.join(root, 'a.md'), 'utf8')).toBe('changed')
    expect(readlink).toHaveBeenCalledWith(expect.stringMatching(/^\/proc\/self\/fd\/\d+$/))
  })

  // The case the path walk alone cannot see: a swap undone before the walk ran.
  it('refuses a descriptor the kernel places outside the root, even when the path walk agrees', async () => {
    readlink.mockResolvedValue('/etc/passwd')
    await expect(readContainedFile(root, 'a.md', LABEL)).rejects.toThrow(`Forbidden: ${LABEL}`)
    await expect(writeContainedFile(root, 'a.md', 'malicious', LABEL)).rejects.toThrow(`Forbidden: ${LABEL}`)
    expect(await fs.readFile(path.join(root, 'a.md'), 'utf8')).toBe('inside')
  })

  it('refuses when the descriptor cannot be looked up, rather than skipping the check', async () => {
    readlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    await expect(readContainedFile(root, 'a.md', LABEL)).rejects.toThrow(`Forbidden: ${LABEL}`)
  })
})
