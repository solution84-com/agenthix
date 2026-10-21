import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OPENCODE_STAGING_CONTAINER_DIR, openCodeSkillsContainerDir } from '@agenthix/core'
import { AGENT_CONTAINER_CLAUDE_HOME } from '../../../agentDiskPaths'
import { SKILLS_STAGING_DIRNAME } from '../../skillsStagingDir'
import { openCodeSkillsDirs, openCodeSkillsSection, stageOpenCodeSkills } from '../openCodeSkills'
import { skillDescription } from '../skillDescription'

let dir: string
beforeEach(async () => {
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'oc-skills-')))
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

async function skill(pkg: string, slug: string, md: string) {
  await fs.mkdir(path.join(dir, pkg, 'skills', slug), { recursive: true })
  await fs.writeFile(path.join(dir, pkg, 'skills', slug, 'SKILL.md'), md)
}

function context(agentPkg = 'agent') {
  return {
    claudeHome: { serverDir: path.join(dir, 'home', '.claude'), visibleDir: AGENT_CONTAINER_CLAUDE_HOME },
    packages: { agentDir: path.join(dir, agentPkg), orgDir: null, platformDir: path.join(dir, 'platform'), refs: {} as never },
    boundaryOverride: null,
    boundarySharedSkills: null,
  }
}

describe('where OpenCode skills are staged', () => {
  it('is the place the plugin reads, under the read-only staging bind', () => {
    expect(OPENCODE_STAGING_CONTAINER_DIR).toBe(path.posix.join(AGENT_CONTAINER_CLAUDE_HOME, SKILLS_STAGING_DIRNAME))
    const dirs = openCodeSkillsDirs(context().claudeHome, 'conv-a')
    expect(dirs.visibleDir).toBe(openCodeSkillsContainerDir('conv-a'))
    expect(dirs.serverDir).toBe(path.join(dir, 'home', '.claude', '.tmp', 'conversation-conv-a', 'skills'))
  })

  it('refuses a conversation id that is not one plain name', () => {
    expect(() => openCodeSkillsDirs(context().claudeHome, '../x')).toThrow()
  })
})

describe('staging a turn', () => {
  it("stages with Claude's namespaces and lists each skill in OpenCode's words", async () => {
    await skill('agent', 'review', '---\nname: Review\ndescription: Review a change.\n---\nBody')
    await skill('platform', 'plan', '---\nname: plan\ndescription: >-\n  Plan work\n  in steps.\n---\nBody')
    const staged = await stageOpenCodeSkills(context(), 'conv-a')
    const base = '/home/appuser/.claude/.tmp/conversation-conv-a/skills'
    expect(staged.skills).toEqual([
      { name: 'platform-plan', description: 'Plan work in steps.', location: `${base}/platform-plan/SKILL.md` },
      { name: 'agent-review', description: 'Review a change.', location: `${base}/agent-review/SKILL.md` },
    ])
    expect(staged.systemSection).toBe([
      'Skills provide specialized instructions and workflows for specific tasks.',
      'Use the skill tool to load a skill when a task matches its description.',
      '<available_skills>',
      '  <skill>',
      '    <name>agent-review</name>',
      '    <description>Review a change.</description>',
      `    <location>${base}/agent-review/SKILL.md</location>`,
      '  </skill>',
      '  <skill>',
      '    <name>platform-plan</name>',
      '    <description>Plan work in steps.</description>',
      `    <location>${base}/platform-plan/SKILL.md</location>`,
      '  </skill>',
      '</available_skills>',
    ].join('\n'))
    const onDisk = await fs.readFile(path.join(openCodeSkillsDirs(context().claudeHome, 'conv-a').serverDir, 'agent-review', 'SKILL.md'), 'utf-8')
    expect(onDisk).toContain('name: agent-review')
  })

  it('shows a skill edited between turns on the next turn, and drops one removed', async () => {
    await skill('agent', 'review', '---\ndescription: First.\n---\nOld body')
    await skill('agent', 'gone', '---\ndescription: Soon gone.\n---\nx')
    await stageOpenCodeSkills(context(), 'conv-a')
    await skill('agent', 'review', '---\ndescription: Second.\n---\nNew body')
    await fs.rm(path.join(dir, 'agent', 'skills', 'gone'), { recursive: true })
    const next = await stageOpenCodeSkills(context(), 'conv-a')
    expect(next.skills.map(s => [s.name, s.description])).toEqual([['agent-review', 'Second.']])
    const folder = path.dirname(openCodeSkillsDirs(context().claudeHome, 'conv-a').serverDir)
    expect((await fs.readdir(folder)).sort()).toEqual(['skills'])
    const body = await fs.readFile(path.join(folder, 'skills', 'agent-review', 'SKILL.md'), 'utf-8')
    expect(body).toContain('New body')
  })

  it("gives two conversations of two agents with a same-named skill each their own", async () => {
    await skill('agent-1', 'deploy', '---\ndescription: One.\n---\nOne')
    await skill('agent-2', 'deploy', '---\ndescription: Two.\n---\nTwo')
    const a = await stageOpenCodeSkills(context('agent-1'), 'conv-a')
    const b = await stageOpenCodeSkills(context('agent-2'), 'conv-b')
    expect(a.skills[0]).toMatchObject({ name: 'agent-deploy', description: 'One.' })
    expect(b.skills[0]).toMatchObject({ name: 'agent-deploy', description: 'Two.' })
    expect(a.skills[0].location).not.toBe(b.skills[0].location)
  })

  it('has no section when nothing was staged', async () => {
    expect(await stageOpenCodeSkills(context(), 'conv-a')).toEqual({ skills: [], systemSection: null })
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
