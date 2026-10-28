import { describe, it, expect } from 'vitest'
import type { LeadRequest, LeadStreamEvent, ModelAdapter, ResolvedAccess } from '../../../../conversations/contract'
import { grade, runCheck, system, tools } from '../proposeSkillCheck'

const access = { providerId: 'p', providerName: 'p', provider: 'openai', model: 'm', apiKey: 'k' } as ResolvedAccess

/** A model that makes these calls, one round each, then answers. */
function scripted(rounds: Array<Array<{ name: string; input: Record<string, unknown> }>>): ModelAdapter & { seen: LeadRequest[] } {
  const seen: LeadRequest[] = []
  return {
    seen,
    async *stream(request: LeadRequest): AsyncIterable<LeadStreamEvent> {
      seen.push(request)
      const calls = rounds[seen.length - 1] ?? []
      if (calls.length === 0) yield { type: 'text', text: 'Done.' }
      for (const [i, c] of calls.entries()) yield { type: 'tool-call', call: { id: `c${seen.length}-${i}`, ...c } }
    },
    complete: async () => { throw new Error('not used') },
  }
}

const SKILL = { 'SKILL.md': '---\nname: pr-review\ndescription: Review a pull request.\n---\n\n1. Read it.\n' }

describe('the propose_skill model check @SC-1662', () => {
  it('gives the agent skill-creator in its list, and the skill tool answers with its own SKILL.md', async () => {
    expect(system()[0]!.text).toContain('platform-skill-creator')
    expect(tools().map(t => t.name)).toEqual(['Skill', 'Read', 'Write', 'Bash', 'propose_skill'])
    const model = scripted([[{ name: 'Skill', input: { name: 'platform-skill-creator' } }], []])
    await runCheck(model, access)
    const result = model.seen[1]!.messages.at(-1) as { result: string }
    expect(result.result).toContain('propose_skill')
  })

  it('passes a run that loads the skill and proposes with a SKILL.md', async () => {
    const run = await runCheck(scripted([
      [{ name: 'Skill', input: { name: 'platform-skill-creator' } }],
      [{ name: 'propose_skill', input: { name: 'pr-review', description: 'x', files: SKILL, why: 'asked', aim: 'project' } }],
      [],
    ]), access)
    expect(grade(run)).toEqual({ passed: true })
  })

  it('fails a run that writes the skill into files, even if it proposes too', async () => {
    const run = await runCheck(scripted([
      [{ name: 'Write', input: { file_path: '/projects/website-rebuild/files/.agents/skills/pr-review/SKILL.md', content: 'x' } }],
      [{ name: 'propose_skill', input: { name: 'pr-review', description: 'x', files: SKILL, why: 'asked', aim: 'project' } }],
      [],
    ]), access)
    expect(grade(run)).toMatchObject({ passed: false, why: expect.stringContaining("wrote a skill's files") })
  })

  it('fails a run that never proposes, or proposes without a SKILL.md', async () => {
    expect(grade(await runCheck(scripted([[]]), access))).toMatchObject({ passed: false, why: expect.stringContaining('never called') })
    const run = await runCheck(scripted([
      [{ name: 'propose_skill', input: { name: 'pr-review', description: 'x', files: { 'README.md': 'x' }, why: 'asked', aim: 'project' } }], [],
    ]), access)
    expect(grade(run)).toMatchObject({ passed: false, why: expect.stringContaining('without a SKILL.md') })
  })
})
