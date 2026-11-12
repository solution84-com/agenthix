import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NO_ROBOT_FILES, loadRobots } from '../robots'
import { ROBOTS_BUNDLE } from '../robotsBundle'

const picture = (name: string) => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.from(name)])
const sha256 = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex')

let dir: string

async function writeBundle(names: string[], manifest?: unknown) {
  const robots: { name: string; file: string; sha256: string; bytes: number }[] = []
  for (const name of names) {
    const data = picture(name)
    await fs.writeFile(path.join(dir, `${name}.webp`), data)
    robots.push({ name, file: `${name}.webp`, sha256: sha256(data), bytes: data.length })
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest ?? { bundle: 'robots-1', version: 1, robots }))
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'robots-'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})

describe('loadRobots', () => {
  it('gives the manifest names in order, and reads a robot by its name', async () => {
    await writeBundle(['planner-checklist', 'security', 'kernel'])
    const robots = await loadRobots(dir)
    expect(robots?.names).toEqual(['planner-checklist', 'security', 'kernel'])
    expect(await robots?.robot('security')).toEqual(picture('security'))
  })

  it('is null where the bundle is missing, without a warning', async () => {
    expect(await loadRobots(dir)).toBeNull()
    expect(await loadRobots(path.join(dir, 'nowhere'))).toBeNull()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('is null where a picture does not match the manifest, or is missing', async () => {
    await writeBundle(['security', 'support'])
    await fs.writeFile(path.join(dir, 'support.webp'), picture('changed'))
    expect(await loadRobots(dir)).toBeNull()
    await fs.rm(path.join(dir, 'support.webp'))
    expect(await loadRobots(dir)).toBeNull()
  })

  it('is null for a manifest that is not JSON, lists nothing, or names a file other than <name>.webp', async () => {
    await fs.writeFile(path.join(dir, 'manifest.json'), '{')
    expect(await loadRobots(dir)).toBeNull()
    await writeBundle([], { robots: [] })
    expect(await loadRobots(dir)).toBeNull()
    await writeBundle(['security'], { robots: [{ name: 'security', file: '../security.webp', sha256: '0'.repeat(64) }] })
    expect(await loadRobots(dir)).toBeNull()
    await writeBundle(['security'], { robots: [{ name: '../escape', file: '../escape.webp', sha256: '0'.repeat(64) }] })
    expect(await loadRobots(dir)).toBeNull()
  })

  it('refuses a name the manifest does not list, a path-like name and an empty one, reading nothing', async () => {
    await writeBundle(['security'])
    await fs.writeFile(path.join(dir, 'other.webp'), picture('other'))
    const robots = await loadRobots(dir)
    const read = vi.spyOn(fs, 'readFile')
    for (const name of ['other', '../robots/security', 'security.webp', '/etc/passwd', '']) {
      await expect(robots?.robot(name)).rejects.toThrow('is not a robot in the bundle')
    }
    expect(read).not.toHaveBeenCalled()
  })
})

describe('without robots', () => {
  it('reads nothing', async () => {
    await expect(NO_ROBOT_FILES.robot('security')).rejects.toThrow('not installed')
  })
})

describe('the pin', () => {
  it('names a bundle, its release download address on this repository and a SHA-256', () => {
    expect(ROBOTS_BUNDLE.url).toBe(
      `https://github.com/${ROBOTS_BUNDLE.repository}/releases/download/${ROBOTS_BUNDLE.bundle}/${ROBOTS_BUNDLE.bundle}.tar.gz`,
    )
    expect(ROBOTS_BUNDLE.bundle).toBe(`robots-${ROBOTS_BUNDLE.version}`)
    expect(ROBOTS_BUNDLE.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
