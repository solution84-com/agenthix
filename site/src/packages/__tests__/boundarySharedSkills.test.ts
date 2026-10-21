/**
 * A boundary's shared skills (ADR-0072): a skill placed once in a project's or
 * a person's `.agents/skills/` reaches every agent working in that boundary,
 * under its own `shared-` namespace, alongside any one agent's own boundary
 * skills.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveBoundaryOverrideDir, resolveBoundarySharedSkillsDir } from '../boundaryOverrides'
import { getFilesDir } from '../../server/storage/paths'
import { skillRootsFor, stageSkills } from '../../agents/runtime/skillStaging'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-')))
  process.env.SITE_ROOT = root
})
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const project = { ownerType: 'project' as const, ownerId: 'p1' }
const person = { ownerType: 'user' as const, ownerId: 'u1' }

async function writeSkill(dir: string, slug: string, description: string): Promise<void> {
  await fs.mkdir(path.join(dir, slug), { recursive: true })
  await fs.writeFile(path.join(dir, slug, 'SKILL.md'), `---\nname: ${slug}\ndescription: ${description}\n---\n`)
}

async function emptyPackages() {
  const dirs = { platformDir: path.join(root, 'pkg', 'platform'), orgDir: null, agentDir: path.join(root, 'pkg', 'agent') }
  await fs.mkdir(dirs.platformDir, { recursive: true })
  await fs.mkdir(dirs.agentDir, { recursive: true })
  return dirs
}

/** What one agent's run in `loc` is staged with, as runLaunch and ClaudeSDKRuntime resolve it. */
async function stagedFor(loc: typeof project | typeof person, agentId: string): Promise<string[]> {
  const override = await resolveBoundaryOverrideDir(loc, agentId)
  const shared = await resolveBoundarySharedSkillsDir(loc)
  const dest = path.join(root, 'out', `${loc.ownerId}-${agentId}`)
  const staged = await stageSkills(skillRootsFor(await emptyPackages(), override, shared), dest)
  return staged.map(s => s.name)
}

describe('boundary shared skills @SC-447', () => {
  it('a skill placed once in a project reaches two agents working there', async () => {
    await writeSkill(path.join(getFilesDir('project', 'p1'), '.agents', 'skills'), 'house-style', 'project conventions')
    expect(await stagedFor(project, 'agent-1')).toEqual(['shared-house-style'])
    expect(await stagedFor(project, 'agent-2')).toEqual(['shared-house-style'])
  })

  it("a skill in a person's own space reaches that person's agents, and no other boundary's", async () => {
    await writeSkill(path.join(getFilesDir('user', 'u1'), '.agents', 'skills'), 'my-notes', 'personal')
    expect(await stagedFor(person, 'agent-1')).toEqual(['shared-my-notes'])
    expect(await stagedFor(person, 'agent-2')).toEqual(['shared-my-notes'])
    expect(await stagedFor(project, 'agent-1')).toEqual([])
  })

  it("sits beside one agent's own boundary skill of the same slug, neither replacing the other", async () => {
    const home = getFilesDir('project', 'p1')
    await writeSkill(path.join(home, '.agents', 'skills'), 'review', 'for everyone')
    await writeSkill(path.join(home, '.agents', 'agents', 'agent-1', 'skills'), 'review', 'for agent-1')
    expect(await stagedFor(project, 'agent-1')).toEqual(['boundary-review', 'shared-review'])
    expect(await stagedFor(project, 'agent-2')).toEqual(['shared-review'])
  })

  it('reads the standard .agents folder only — the old .agenthix folder is not read', async () => {
    const home = getFilesDir('project', 'p1')
    await writeSkill(path.join(home, '.agenthix', 'skills'), 'old', 'old place')
    await writeSkill(path.join(home, '.agenthix', 'agents', 'agent-1', 'skills'), 'old-own', 'old place')
    expect(await stagedFor(project, 'agent-1')).toEqual([])
  })

  it('resolves nothing when the folder is absent', async () => {
    expect(await resolveBoundarySharedSkillsDir(project)).toBeNull()
  })

  it('ignores a skills folder that is a link leaving the files home', async () => {
    const home = getFilesDir('project', 'p1')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
    try {
      await writeSkill(outside, 'evil', 'x')
      await fs.mkdir(path.join(home, '.agents'), { recursive: true })
      await fs.symlink(outside, path.join(home, '.agents', 'skills'))
      expect(await resolveBoundarySharedSkillsDir(project)).toBeNull()
      expect(await stagedFor(project, 'agent-1')).toEqual([])
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})
