import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  OPENCODE_CONFIG_CONTAINER_DIRS,
  openCodeConfigMountArgs,
  openCodeConfigSourceDir,
  prepareOpenCodeConfigMounts,
} from '../openCodeConfigMounts'
import type { ContainerKey } from '../containerTypes'

const KEY: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: 'u-ada', mode: 'rw', runner: { kind: 'person', userId: 'u-ada' } }
let root: string
let home: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-config-'))
  process.env.SITE_ROOT = root
  home = path.join(root, 'homes', 'users', 'u-ada', 'personal')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("OpenCode's configuration folders", () => {
  it('are both mounted read-only from one folder outside every home', () => {
    expect(OPENCODE_CONFIG_CONTAINER_DIRS).toEqual(['/home/appuser/.config/opencode', '/home/appuser/.opencode'])
    const source = path.join(root, 'harness', 'opencode-config')
    expect(openCodeConfigSourceDir()).toBe(source)
    expect(openCodeConfigMountArgs()).toEqual([
      '-v', `${source}:/home/appuser/.config/opencode:ro`,
      '-v', `${source}:/home/appuser/.opencode:ro`,
    ])
  })

  it("hold OpenCode's own .gitignore and nothing else, so it never writes one", async () => {
    await prepareOpenCodeConfigMounts(KEY)
    const source = openCodeConfigSourceDir()
    expect(await fs.readdir(source)).toEqual(['.gitignore'])
    expect(await fs.readFile(path.join(source, '.gitignore'), 'utf8')).toBe('node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore')
    expect((await fs.stat(path.join(source, '.gitignore'))).mode & 0o777).toBe(0o444)
  })

  it('have real mount points in the home, and preparing twice changes nothing', async () => {
    await prepareOpenCodeConfigMounts(KEY)
    await prepareOpenCodeConfigMounts(KEY)
    for (const dir of ['.config', '.config/opencode', '.opencode']) {
      expect((await fs.lstat(path.join(home, dir))).isDirectory()).toBe(true)
    }
  })

  it('replace a link or a file left in the home, never following it', async () => {
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    await fs.mkdir(home, { recursive: true })
    await fs.symlink(outside, path.join(home, '.config'))
    await fs.writeFile(path.join(home, '.opencode'), 'planted')

    await prepareOpenCodeConfigMounts(KEY)

    expect((await fs.lstat(path.join(home, '.config'))).isDirectory()).toBe(true)
    expect((await fs.lstat(path.join(home, '.opencode'))).isDirectory()).toBe(true)
    expect(await fs.readdir(outside)).toEqual([])
  })

  it('keep what a folder already holds beside the mount point', async () => {
    await fs.mkdir(path.join(home, '.config', 'git'), { recursive: true })
    await prepareOpenCodeConfigMounts(KEY)
    expect((await fs.readdir(path.join(home, '.config'))).sort()).toEqual(['git', 'opencode'])
  })
})
