import { describe, it, expect } from 'vitest'
import { readTeamTemplate, validateTeamTemplate } from '../teamTemplateFile'

const f = (path: string, value: unknown) => ({ path, content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) })
const SKILL = '---\nname: plan\ndescription: Plans\n---\n\nPlan.'

const team = (over: Record<string, unknown> = {}, agent: Record<string, unknown> = {}) => [
  f('team.json', {
    name: 'Crew', description: 'A crew', tags: ['x'],
    teams: [{ name: 'Eng', purpose: 'Build', agents: ['lead'] }],
    projects: [{ name: 'Main', defaultAgentHandle: 'lead', boards: [{ name: 'Flow', template: 'kanban' }] }],
    ...over,
  }),
  f('agents/lead/agent.json', { name: 'Lead', role: 'Leads', responsibilities: 'Runs it.\nAll of it.', approval: 'immediate', skills: ['plan'], extra: 'dropped', ...agent }),
  f('skills/plan/SKILL.md', SKILL),
]

describe("a team template's files", () => {
  it('reads its teams, agents, projects and boards, and only the fields it knows', () => {
    expect(readTeamTemplate(team())).toEqual({
      name: 'Crew', description: 'A crew', tags: ['x'],
      teams: [{ name: 'Eng', purpose: 'Build', agents: ['lead'] }],
      projects: [{ name: 'Main', description: '', defaultAgentHandle: 'lead', boards: [{ name: 'Flow', template: 'kanban' }] }],
      agents: {
        lead: {
          name: 'Lead', handle: 'lead', role: 'Leads', responsibilities: 'Runs it.\nAll of it.', approval: 'immediate',
          allowedTools: null, allowedBashPatterns: null, skills: ['plan'],
        },
      },
    })
  })

  it('refuses people, a handle that names a path, an agent in two teams, and a lead who is not one of its agents', () => {
    const error = (files: ReturnType<typeof team>) => validateTeamTemplate(files).errors[0]
    expect(error(team({ people: ['ana'] }))).toMatch(/agents only/)
    expect(error(team({ teams: [{ name: 'T', agents: ['lead'], people: ['ana'] }] }))).toMatch(/agents only/)
    expect(error(team({ teams: [{ name: 'T', agents: ['../x'] }] }))).toMatch(/handle/i)
    expect(error(team({ teams: [{ name: 'A', agents: ['lead'] }, { name: 'B', agents: ['lead'] }] }))).toMatch(/two teams/)
    expect(error(team({ projects: [{ name: 'P', defaultAgentHandle: 'ghost', boards: [] }] }))).toMatch(/defaultAgentHandle/)
    expect(error(team({ teams: [] }))).toMatch(/at least one team/)
  })

  it("refuses an agent that names a skill the package doesn't hold, an unknown approval, and a missing agent.json", () => {
    const error = (files: Array<ReturnType<typeof f>>) => validateTeamTemplate(files).errors[0]
    expect(error(team({}, { skills: ['ghost'] }))).toMatch(/names the skill ghost/)
    expect(error(team({}, { approval: 'always' }))).toMatch(/approval/)
    expect(error(team().filter(x => !x.path.startsWith('agents/')))).toMatch(/agents\/lead\/agent\.json/)
    expect(validateTeamTemplate(team()).errors).toEqual([])
  })
})
