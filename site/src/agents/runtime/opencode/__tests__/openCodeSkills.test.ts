import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OPENCODE_STAGING_CONTAINER_DIR, openCodeSkillsContainerDir } from '@agenthix/core'
import { RUN_STAGING_CONTAINER_DIR } from '../../harnessHomes'
import { RUN_STAGING_SKILLS } from '../../runStagingFolders'
import { openCodeSkillsDirs, openCodeSkillsSection, stageOpenCodeSkills } from '../openCodeSkills'
import { skillDescription } from '../skillDescription'
import { storeVerifiedPackage } from '../../../../packages/packageCache'
import { makeTransfer } from '../../../../packages/__tests__/transferFixture'
import { cacheInstalledSkills, installedOnly } from '../../__tests__/installedSkillFixture'
import type { RunSkillInputs } from '../../skillSources'

vi.mock('#db', () => ({ prisma: { agentRun: { update: vi.fn(async () => ({})) } } }))

let dir: string
beforeEach(async () => {
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'oc-skills-')))
  process.env.SITE_ROOT = dir
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

/** The skills hq gives the run, installed for its agent: each slug's SKILL.md. */
async function given(skills: Record<string, string>): Promise<RunSkillInputs> {
  return installedOnly(await cacheInstalledSkills(Object.fromEntries(Object.entries(skills).map(([slug, md]) => [slug, { 'SKILL.md': md }]))))
}

function context(skills: RunSkillInputs | null = null) {
  return {
    runId: 'run-1',
    runStaging: { serverDir: path.join(dir, 'run-staging'), visibleDir: RUN_STAGING_CONTAINER_DIR },
    skills,
  }
}

describe('where OpenCode skills are staged @SC-1604', () => {
  it('is the place the plugin reads, in run staging, mounted read-only outside the harness home (adr-0173)', () => {
    expect(OPENCODE_STAGING_CONTAINER_DIR).toBe(path.posix.join(RUN_STAGING_CONTAINER_DIR, RUN_STAGING_SKILLS))
    const dirs = openCodeSkillsDirs(context().runStaging, 'conv-a')
    expect(dirs.visibleDir).toBe(openCodeSkillsContainerDir('conv-a'))
    expect(dirs.serverDir).toBe(path.join(dir, 'run-staging', 'skills', 'conversation-conv-a', 'skills'))
  })

  it('refuses a conversation id that is not one plain name', () => {
    expect(() => openCodeSkillsDirs(context().runStaging, '../x')).toThrow()
  })
})

describe('staging a turn', () => {
  it("stages with Claude's namespaces and lists each skill in OpenCode's words", async () => {
    const skills = await given({
      plan: '---\nname: plan\ndescription: >-\n  Plan work\n  in steps.\n---\nBody',
      review: '---\nname: Review\ndescription: Review a change.\n---\nBody',
    })
    const staged = await stageOpenCodeSkills(context(skills), 'conv-a')
    const base = '/run/staging/skills/conversation-conv-a/skills'
    expect(staged.skills).toEqual([
      { name: 'agent-plan', description: 'Plan work in steps.', location: `${base}/agent-plan/SKILL.md` },
      { name: 'agent-review', description: 'Review a change.', location: `${base}/agent-review/SKILL.md` },
    ])
    expect(staged.systemSection).toBe([
      'Skills provide specialized instructions and workflows for specific tasks.',
      'Use the skill tool to load a skill when a task matches its description.',
      '<available_skills>',
      '  <skill>',
      '    <name>agent-plan</name>',
      '    <description>Plan work in steps.</description>',
      `    <location>${base}/agent-plan/SKILL.md</location>`,
      '  </skill>',
      '  <skill>',
      '    <name>agent-review</name>',
      '    <description>Review a change.</description>',
      `    <location>${base}/agent-review/SKILL.md</location>`,
      '  </skill>',
      '</available_skills>',
    ].join('\n'))
    const onDisk = await fs.readFile(path.join(openCodeSkillsDirs(context().runStaging, 'conv-a').serverDir, 'agent-review', 'SKILL.md'), 'utf-8')
    expect(onDisk).toContain('name: agent-review')
  })

  it('shows a skill edited between turns on the next turn, and drops one removed', async () => {
    await stageOpenCodeSkills(context(await given({ review: '---\ndescription: First.\n---\nOld body', gone: '---\ndescription: Soon gone.\n---\nx' })), 'conv-a')
    const next = await stageOpenCodeSkills(context(await given({ review: '---\ndescription: Second.\n---\nNew body' })), 'conv-a')
    expect(next.skills.map(s => [s.name, s.description])).toEqual([['agent-review', 'Second.']])
    const folder = path.dirname(openCodeSkillsDirs(context().runStaging, 'conv-a').serverDir)
    expect((await fs.readdir(folder)).sort()).toEqual(['skills'])
    const body = await fs.readFile(path.join(folder, 'skills', 'agent-review', 'SKILL.md'), 'utf-8')
    expect(body).toContain('New body')
  })

  it("gives two conversations with a same-named skill each their own", async () => {
    const a = await stageOpenCodeSkills(context(await given({ deploy: '---\ndescription: One.\n---\nOne' })), 'conv-a')
    const b = await stageOpenCodeSkills(context(await given({ deploy: '---\ndescription: Two.\n---\nTwo' })), 'conv-b')
    expect(a.skills[0]).toMatchObject({ name: 'agent-deploy', description: 'One.' })
    expect(b.skills[0]).toMatchObject({ name: 'agent-deploy', description: 'Two.' })
    expect(a.skills[0].location).not.toBe(b.skills[0].location)
  })

  it('lists an installed skill hq named, from its delivered content', async () => {
    const { ref, body } = makeTransfer('skill', 'v1', { 'SKILL.md': '---\nname: x\ndescription: Review well.\n---\nBody' })
    await storeVerifiedPackage(ref, body)
    const staged = await stageOpenCodeSkills({
      ...context(),
      skills: {
        place: { ownerType: 'project', ownerId: 'p1' }, agentId: 'a1', personId: null, files: [], person: [],
        installed: [{ identity: 'acme/review', version: '1.0.0', digest: ref.digest, level: 'agent', ref }],
      },
    }, 'conv-a')
    expect(staged.skills.map(s => [s.name, s.description])).toEqual([['agent-review', 'Review well.']])
  })

  it('has no section when nothing was staged', async () => {
    expect(await stageOpenCodeSkills(context(), 'conv-a')).toEqual({ skills: [], systemSection: null, invocable: [] })
  })

  it("says none are available when no staged skill has a description, as OpenCode does", () => {
    expect(openCodeSkillsSection([{ name: 'a', description: undefined, location: '/x' }])).toMatch(/\nNo skills are currently available\.$/)
  })
})

describe("a skill's description", () => {
  it('reads the forms skill files use', () => {
    const fm = (body: string) => `---\nname: x\n${body}\n---\ntext`
    expect(skillDescription(fm('description: Plain words: with a colon'))).toBe('Plain words: with a colon')
    expect(skillDescription(fm('description: Starts here\n  and continues'))).toBe('Starts here and continues')
    expect(skillDescription(fm('description: "Quoted \\"text\\""'))).toBe('Quoted "text"')
    expect(skillDescription(fm("description: 'It''s single'"))).toBe("It's single")
    expect(skillDescription(fm('description: |\n  Line one\n  Line two'))).toBe('Line one\nLine two\n')
    expect(skillDescription(fm('description: >\n  Folded\n  text'))).toBe('Folded text\n')
    expect(skillDescription(fm('description: >-\n  Folded\n  text\nother: 1'))).toBe('Folded text')
  })

  it('is none without front matter, without the key, or when empty', () => {
    expect(skillDescription('description: not front matter')).toBeUndefined()
    expect(skillDescription('---\nname: x\n---\n')).toBeUndefined()
    expect(skillDescription('---\ndescription:\n---\n')).toBeUndefined()
    expect(skillDescription('---\n  description: nested\n---\n')).toBeUndefined()
  })
})
