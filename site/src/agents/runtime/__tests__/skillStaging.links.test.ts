/**
 * A turn's skills are staged into the run's staging folder (`<home>/.claude/.tmp`). A run that renamed `.claude`
 * and put a link in its place, or replaced `.tmp` or its conversation's folder, never steers the staging, the
 * removal or the read-back into what the link leads to.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_CONTAINER_CLAUDE_HOME } from '../../agentDiskPaths'
import { stageOpenCodeSkills } from '../opencode/openCodeSkills'
import { removeStagedSkills, stageTurnSkills } from '../claude/claudeSkills'
import { cacheInstalledSkills, installedOnly } from './installedSkillFixture'
import type { RunContext } from '../types'

vi.mock('#db', () => ({ prisma: { agentRun: { update: vi.fn(async () => ({})) } } }))

let root: string
let mine: string
let other: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'stage-links-')))
  process.env.SITE_ROOT = root
  mine = path.join(root, 'mine')
  other = path.join(root, 'other')
  await fs.mkdir(path.join(mine, '.claude', '.tmp'), { recursive: true })
  await fs.mkdir(path.join(other, '.claude', '.tmp', 'conversation-conv-a', 'skills', 'agent-x'), { recursive: true })
  await fs.writeFile(path.join(other, '.claude', '.tmp', 'conversation-conv-a', 'skills', 'agent-x', 'SKILL.md'), 'theirs')
})
afterEach(async () => {
  delete process.env.SITE_ROOT
  await fs.rm(root, { recursive: true, force: true })
})

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name)
    out[path.relative(dir, full)] = entry.isFile() ? await fs.readFile(full, 'utf-8') : entry.isDirectory() ? '<dir>' : '<other>'
  }
  return out
}

async function context() {
  const skills = installedOnly(await cacheInstalledSkills({ review: { 'SKILL.md': '---\nname: Review\ndescription: Review.\n---\nBody' } }))
  return {
    runId: 'run-1',
    claudeHome: { serverDir: path.join(mine, '.claude'), visibleDir: AGENT_CONTAINER_CLAUDE_HOME },
    skills,
  }
}

const linkClaude = async () => {
  await fs.rename(path.join(mine, '.claude'), path.join(mine, '.claude-old'))
  await fs.symlink(path.join(other, '.claude'), path.join(mine, '.claude'))
}
const linkTmp = async () => {
  await fs.rm(path.join(mine, '.claude', '.tmp'), { recursive: true })
  await fs.symlink(path.join(other, '.claude', '.tmp'), path.join(mine, '.claude', '.tmp'))
}

describe('a Claude turn\'s skills', () => {
  for (const [what, plant] of [['`.claude` is a link to another home', linkClaude], ['`.tmp` is a link to another home\'s', linkTmp]] as const) {
    it(`are refused, and nothing reaches the other home, when ${what}`, async () => {
      const ctx = await context()
      await plant()
      const before = await snapshot(other)
      await expect(stageTurnSkills(ctx as unknown as RunContext)).rejects.toThrow(/Forbidden/)
      await removeStagedSkills(path.join(mine, '.claude', '.tmp', 'conversation-conv-a'))
      expect(await snapshot(other)).toEqual(before)
    })
  }

  it('are staged, read back and removed in a home whose folders are its own', async () => {
    const staged = await stageTurnSkills((await context()) as unknown as RunContext)
    expect(staged?.names).toEqual(['agent-review'])
    expect(staged?.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await fs.readFile(path.join(staged!.serverDir, '.claude', 'skills', 'agent-review', 'SKILL.md'), 'utf-8')).toContain('name: agent-review')
    await removeStagedSkills(staged!.serverDir)
    expect(await fs.readdir(path.join(mine, '.claude', '.tmp'))).toEqual([])
  })
})

describe('an OpenCode conversation\'s skills', () => {
  for (const [what, plant] of [
    ['`.claude` is a link to another home', linkClaude],
    ['`.tmp` is a link to another home\'s', linkTmp],
    ['the conversation\'s folder is a link to another home\'s', async () => {
      await fs.symlink(path.join(other, '.claude', '.tmp', 'conversation-conv-a'), path.join(mine, '.claude', '.tmp', 'conversation-conv-a'))
    }],
  ] as const) {
    it(`are refused, and nothing reaches the other home, when ${what}`, async () => {
      const ctx = await context()
      await plant()
      const before = await snapshot(other)
      await expect(stageOpenCodeSkills(ctx, 'conv-a')).rejects.toThrow(/Forbidden/)
      expect(await snapshot(other)).toEqual(before)
    })
  }

  it('a skills folder that is a link is moved aside and removed as a link, its target untouched', async () => {
    await fs.mkdir(path.join(mine, '.claude', '.tmp', 'conversation-conv-a'))
    await fs.symlink(path.join(other, '.claude', '.tmp', 'conversation-conv-a', 'skills'), path.join(mine, '.claude', '.tmp', 'conversation-conv-a', 'skills'))
    const before = await snapshot(other)
    const staged = await stageOpenCodeSkills(await context(), 'conv-a')
    expect(staged.skills.map(s => s.name)).toEqual(['agent-review'])
    expect(await snapshot(other)).toEqual(before)
  })
})
