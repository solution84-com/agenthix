/**
 * What the site stages for a run lives in the runner's run staging, outside the harness home (adr-0173): a run that
 * renames `.claude` in its home, or puts a symbolic link there, changes nothing the site stages or the harness loads.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_CONTAINER_CLAUDE_HOME } from '../../agentDiskPaths'
import { stageOpenCodeSkills } from '../opencode/openCodeSkills'
import { removeStagedSkills, stageTurnSkills } from '../claude/claudeSkills'
import { RUN_STAGING_CONTAINER_DIR, runStagingFor } from '../harnessHomes'
import { runStagingBind } from '../runStaging'
import { cacheInstalledSkills, installedOnly } from './installedSkillFixture'
import type { RunContext } from '../types'
import type { ContainerKey } from '../containerTypes'

vi.mock('#db', () => ({ prisma: { agentRun: { update: vi.fn(async () => ({})) } } }))

let root: string
let home: string
let staging: string
let other: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'run-staging-')))
  process.env.SITE_ROOT = root
  home = path.join(root, 'homes', 'users', 'u1', 'p1')
  staging = path.join(root, 'run-staging', 'users', 'u1', 'p1')
  other = path.join(root, 'homes', 'users', 'u2', 'p1')
  await fs.mkdir(path.join(home, '.claude'), { recursive: true })
  await fs.mkdir(path.join(other, '.claude', 'skills', 'agent-x'), { recursive: true })
  await fs.writeFile(path.join(other, '.claude', 'skills', 'agent-x', 'SKILL.md'), 'theirs')
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
    claudeHome: { serverDir: path.join(home, '.claude'), visibleDir: AGENT_CONTAINER_CLAUDE_HOME },
    runStaging: { serverDir: staging, visibleDir: RUN_STAGING_CONTAINER_DIR },
    skills,
  }
}

/** What a run in the container can do to its own home: move `.claude` aside and put a symlink in its place. */
const replaceClaudeWithLink = async () => {
  await fs.rename(path.join(home, '.claude'), path.join(home, '.claude-old'))
  await fs.symlink(path.join(other, '.claude'), path.join(home, '.claude'))
}

describe('run staging is laid out like the homes, outside them', () => {
  it('is one folder per runner per boundary, mounted read-only at /run/staging', () => {
    const key = { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'person', userId: 'u1' } } as ContainerKey
    expect(runStagingFor(key)).toBe(staging)
    expect(runStagingBind(key)).toBe(`${staging}:/run/staging:ro`)
  })
})

describe("a Claude turn's skills", () => {
  it('are staged into run staging, told to the harness at /run/staging, and removed, whatever the run did to its home', async () => {
    await replaceClaudeWithLink()
    const before = await snapshot(other)
    const staged = await stageTurnSkills((await context()) as unknown as RunContext)
    expect(staged?.names).toEqual(['agent-review'])
    expect(staged!.serverDir.startsWith(path.join(staging, 'skills') + path.sep)).toBe(true)
    expect(staged!.visiblePluginDir).toMatch(/^\/run\/staging\/skills\/skills-[^/]+\/\.claude$/)
    expect(await fs.readFile(path.join(staged!.serverDir, '.claude', 'skills', 'agent-review', 'SKILL.md'), 'utf-8')).toContain('name: agent-review')
    expect(await snapshot(other)).toEqual(before)
    await removeStagedSkills(staged!.serverDir)
    expect(await fs.readdir(path.join(staging, 'skills'))).toEqual([])
  })
})

describe("an OpenCode conversation's skills", () => {
  it('are staged into run staging, never into the home a run can change', async () => {
    await replaceClaudeWithLink()
    const before = await snapshot(other)
    const staged = await stageOpenCodeSkills(await context(), 'conv-a')
    expect(staged.skills.map(s => s.location)).toEqual(['/run/staging/skills/conversation-conv-a/skills/agent-review/SKILL.md'])
    expect(await fs.readFile(path.join(staging, 'skills', 'conversation-conv-a', 'skills', 'agent-review', 'SKILL.md'), 'utf-8')).toContain('agent-review')
    expect(await snapshot(other)).toEqual(before)
  })
})
