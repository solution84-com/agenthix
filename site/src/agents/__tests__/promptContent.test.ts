import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadPromptContent } from '../promptContent'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('loadPromptContent', () => {
  it('reads instructions from the agent package and ORG.md from the org package', async () => {
    await fs.mkdir(path.join(dir, 'agent'))
    await fs.mkdir(path.join(dir, 'org'))
    await fs.writeFile(path.join(dir, 'agent', 'instructions.md'), '# Scout\n')
    await fs.writeFile(path.join(dir, 'org', 'ORG.md'), '---\nname: Acme\n---\n')
    expect(await loadPromptContent({ agentDir: path.join(dir, 'agent'), orgDir: path.join(dir, 'org') }))
      .toEqual({ instructions: '# Scout', org: '---\nname: Acme\n---' })
  })

  it('treats a missing file or a missing org package as no content', async () => {
    await fs.mkdir(path.join(dir, 'agent'))
    expect(await loadPromptContent({ agentDir: path.join(dir, 'agent'), orgDir: null }))
      .toEqual({ instructions: null, org: null })
  })

  it('appends a boundary\'s instructions after the package\'s', async () => {
    await fs.mkdir(path.join(dir, 'agent'))
    await fs.mkdir(path.join(dir, 'override'))
    await fs.writeFile(path.join(dir, 'agent', 'instructions.md'), '# Scout')
    await fs.writeFile(path.join(dir, 'override', 'instructions.md'), 'In Atlas, cite the ADR.')
    // filesHome must be the override dir's real parent — realpath'd once here so a
    // platform where the tmp root itself resolves through a symlink (macOS'
    // /tmp -> /private/tmp) doesn't trip the containment recheck in readBoundaryFile.
    const realDir = await fs.realpath(dir)
    const override = { dir: path.join(realDir, 'override'), filesHome: realDir }
    const content = await loadPromptContent({ agentDir: path.join(dir, 'agent'), orgDir: null }, override)
    expect(content.instructions).toBe('# Scout\n\nIn Atlas, cite the ADR.')
  })

  it('drops the override when its directory has been swapped for a link out (TOCTOU recheck)', async () => {
    await fs.mkdir(path.join(dir, 'agent'))
    const realDir = await fs.realpath(dir)
    const overrideDir = path.join(realDir, 'override')
    await fs.mkdir(overrideDir)
    await fs.writeFile(path.join(dir, 'agent', 'instructions.md'), '# Scout')
    await fs.writeFile(path.join(overrideDir, 'instructions.md'), 'stale')
    const override = { dir: overrideDir, filesHome: realDir }

    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
    try {
      await fs.writeFile(path.join(outside, 'instructions.md'), 'exfiltrated')
      await fs.rm(overrideDir, { recursive: true, force: true })
      await fs.symlink(outside, overrideDir)
      const content = await loadPromptContent({ agentDir: path.join(dir, 'agent'), orgDir: null }, override)
      expect(content.instructions).toBe('# Scout')
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})
