import { describe, it, expect } from 'vitest'
import { PLATFORM_TOOLS_INSTRUCTIONS, buildMemoryContent, pickedSkillInstruction, pickedSkillReadInstruction } from '@agenthix/core'
import { runSkillsChecks } from '../skillsRunner'
import { runSkillsCheck } from '../skillsRun'
import { SKILL_CHECKS } from '../skillChecks'
import { skillFile, system, tools } from '../skillsWorld'
import { taskRunFoldedTools } from '../../../../conversations/__modelchecks__/taskRun/setup'
import { access, scripted } from './skillsFake'

const check = (id: string) => SKILL_CHECKS.find(c => c.id === id)!
const grade = async (id: string, rounds: Parameters<typeof scripted>[0], text?: string) =>
  check(id).grade(await runSkillsCheck(scripted(rounds, text), access, check(id).ask))
const skill = (name: string) => ({ name: 'skill', input: { name } })
const failed = (why: string) => ({ passed: false, why: expect.stringContaining(why) })

describe('the skills world', () => {
  it('tells the agent what a real run is told and offers the real tools', () => {
    const text = system().map(p => p.text).join('\n\n')
    expect(text).toContain(buildMemoryContent())
    expect(text).toContain(PLATFORM_TOOLS_INSTRUCTIONS)
    expect(text).toContain('<available_skills>')
    for (const name of ['platform-skill-creator', 'org-release-notes', 'person-code-review']) expect(text).toContain(`<name>${name}</name>`)
    expect(tools().map(t => t.name)).toEqual(expect.arrayContaining(['skill', 'read_file', 'write_file', 'bash', 'find_tools', 'use_tool']))
    expect(taskRunFoldedTools().map(t => t.name)).toContain('propose_skill')
  })

  it('answers the skill tool with the skill, and refuses the one only a person picks', async () => {
    const fake = scripted([[skill('platform-skill-creator'), skill('person-code-review')], []])
    await runSkillsCheck(fake, access, 'ask')
    const [loaded, refused] = fake.seen[1]!.messages.slice(-2) as { result: string }[]
    expect(loaded!.result).toContain('propose_skill')
    expect(refused!.result).toContain('only for a person')
  })

  it('sends the picked-skill messages in the words the site sends', () => {
    expect(check('skill-picked').ask.startsWith(pickedSkillInstruction('org-release-notes'))).toBe(true)
    expect(check('skill-picked').ask).toContain('/release-notes')
    expect(check('skill-picked-read').ask.startsWith(pickedSkillReadInstruction('person-code-review', skillFile('person-code-review')))).toBe(true)
  })
})

describe('skill-use', () => {
  it('passes loading the skill first, fails writing without it or writing before it', async () => {
    expect(await grade('skill-use', [[skill('org-release-notes')], []])).toEqual({ passed: true })
    expect(await grade('skill-use', [[]])).toMatchObject(failed('never loaded'))
    expect(await grade('skill-use', [[{ name: 'write_file', input: { file_path: '/x', content: 'y' } }, skill('org-release-notes')], []])).toMatchObject(failed('before loading'))
  })
})

describe('skill-picked', () => {
  it('passes loading the picked skill first, fails any other first call', async () => {
    expect(await grade('skill-picked', [[skill('org-release-notes')], []])).toEqual({ passed: true })
    expect(await grade('skill-picked', [[{ name: 'read_file', input: { file_path: '/x' } }, skill('org-release-notes')], []])).toMatchObject(failed('did not load'))
    expect(await grade('skill-picked', [[]])).toMatchObject(failed('did not load'))
  })
})

describe('skill-picked-read', () => {
  const file = skillFile('person-code-review')
  it('passes reading the staged file first', async () => {
    expect(await grade('skill-picked-read', [[{ name: 'read_file', input: { file_path: file } }], []])).toEqual({ passed: true })
  })
  it('fails loading it with the skill tool, or not reading it first', async () => {
    expect(await grade('skill-picked-read', [[skill('person-code-review')], [{ name: 'read_file', input: { file_path: file } }], []])).toMatchObject(failed('must not'))
    expect(await grade('skill-picked-read', [[{ name: 'bash', input: { command: 'ls' } }], []])).toMatchObject(failed('did not read'))
  })
})

describe('skill-what-can-you-do', () => {
  it('passes an answer naming two listed skills with no work', async () => {
    expect(await grade('skill-what-can-you-do', [[]], 'I can write release notes, do a code review, or make a skill with the skill creator.')).toEqual({ passed: true })
  })
  it('fails naming fewer than two, or starting work', async () => {
    expect(await grade('skill-what-can-you-do', [[]], 'I can help with many things.')).toMatchObject(failed('named 0'))
    expect(await grade('skill-what-can-you-do', [[{ name: 'bash', input: { command: 'npm test' } }], []], 'org-release-notes and person-code-review')).toMatchObject(failed('started work'))
    expect(await grade('skill-what-can-you-do', [[{ name: 'bash', input: { command: 'ls > list.txt' } }], []], 'org-release-notes and person-code-review')).toMatchObject(failed('started work'))
  })
  it('passes a look around with the shell before the answer: reading is not work', async () => {
    expect(await grade('skill-what-can-you-do', [[{ name: 'bash', input: { command: 'ls -la; echo ---; ls -R | head -50' } }], []], 'org-release-notes and person-code-review')).toEqual({ passed: true })
  })
})

describe('the runner', () => {
  it('runs the checks asked for and reports each, calling no model without a key', async () => {
    const lines: string[] = []
    expect(await runSkillsChecks({}, { out: l => lines.push(l) })).toMatchObject({ skipped: expect.any(String) })
    const env = { MODEL_CHECK_PROVIDER: 'openai', MODEL_CHECK_MODELS: 'm', MODEL_CHECK_API_KEY: 'k', MODEL_CHECK_RUNS: '2' }
    const result = await runSkillsChecks(env, { adapter: scripted([[skill('org-release-notes')], []]), out: l => lines.push(l) }, [check('skill-use')])
    expect(result).toMatchObject({ checks: ['skill-use'], models: ['m'] })
    expect(lines.filter(l => l.includes('skill-use · run')).length).toBe(2)
  })
})
