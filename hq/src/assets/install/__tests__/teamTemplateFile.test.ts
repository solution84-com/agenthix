import { describe, it, expect } from 'vitest'
import { readTeamTemplate, validateTeamTemplate } from '../teamTemplateFile'

const f = (path: string, value: unknown) => ({ path, content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) })
const SKILL = '---\nname: plan\ndescription: Plans\n---\n\nPlan.'

const BUG = { name: 'Bug', icon: 'bug', columns: [
  { name: 'Reported', state: 'BACKLOG' }, { name: 'Triaged', state: 'TODO' }, { name: 'Fixing', state: 'IN_PROGRESS' }, { name: 'Verified', state: 'DONE' },
] }
const SEVERITY = { name: 'Severity', options: [{ name: 'Low' }, { name: 'High', colour: 'danger' }] }

const team = (over: Record<string, unknown> = {}, agent: Record<string, unknown> = {}) => [
  f('team.json', {
    name: 'Crew', description: 'A crew', tags: ['x'],
    teams: [{ name: 'Eng', purpose: 'Build', agents: ['lead'] }],
    projects: [{ name: 'Main', defaultAgentHandle: 'lead', types: [BUG], fields: [SEVERITY], boards: [{ name: 'Flow', template: 'kanban' }] }],
    ...over,
  }),
  f('agents/lead/agent.json', { name: 'Lead', role: 'Leads', responsibilities: 'Runs it.\nAll of it.', approval: 'immediate', skills: ['plan'], extra: 'dropped', ...agent }),
  f('skills/plan/SKILL.md', SKILL),
]

describe("a team template's files @SC-1636", () => {
  it('reads its teams, agents, projects with their task types and fields, and only the fields it knows', () => {
    expect(readTeamTemplate(team())).toEqual({
      name: 'Crew', description: 'A crew', tags: ['x'],
      teams: [{ name: 'Eng', purpose: 'Build', agents: ['lead'] }],
      projects: [{
        name: 'Main', description: '', defaultAgentHandle: 'lead',
        types: [{
          name: 'Bug', icon: 'bug', columns: [
            { name: 'Reported', colour: 'neutral', state: 'BACKLOG', defaultForState: true },
            { name: 'Triaged', colour: 'neutral', state: 'TODO', defaultForState: true },
            { name: 'Fixing', colour: 'neutral', state: 'IN_PROGRESS', defaultForState: true },
            { name: 'Verified', colour: 'neutral', state: 'DONE', defaultForState: true },
          ],
        }],
        fields: [{ name: 'Severity', type: 'SINGLE_SELECT', options: [{ name: 'Low', colour: 'neutral' }, { name: 'High', colour: 'danger' }] }],
      }],
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
    expect(error(team({ projects: [{ name: 'P', defaultAgentHandle: 'ghost' }] }))).toMatch(/defaultAgentHandle/)
    expect(error(team({ teams: [] }))).toMatch(/at least one team/)
  })

  it('reads a project with no task types or fields, and refuses ones a task template would refuse, naming the project', () => {
    expect(readTeamTemplate(team({ projects: [{ name: 'Plain' }] })).projects).toEqual([{ name: 'Plain', description: '', defaultAgentHandle: null, types: [], fields: [] }])
    const error = (project: Record<string, unknown>) => validateTeamTemplate(team({ projects: [{ name: 'P', ...project }] })).errors[0]
    expect(error({ types: [{ ...BUG, columns: BUG.columns.slice(0, 3) }] })).toMatch(/^team\.json: project 1: .*Done needs at least one column/)
    expect(error({ types: [{ ...BUG, name: 'Epic' }] })).toMatch(/every project has/)
    expect(error({ fields: [{ name: 'Empty', options: [] }] })).toMatch(/at least one option/)
    expect(error({ types: 'Bug' })).toMatch(/"types" is a list/)
  })

  it("refuses an agent that names a skill the package doesn't hold, an unknown approval, and a missing agent.json", () => {
    const error = (files: Array<ReturnType<typeof f>>) => validateTeamTemplate(files).errors[0]
    expect(error(team({}, { skills: ['ghost'] }))).toMatch(/names the skill ghost/)
    expect(error(team({}, { approval: 'always' }))).toMatch(/approval/)
    expect(error(team().filter(x => !x.path.startsWith('agents/')))).toMatch(/agents\/lead\/agent\.json/)
    expect(validateTeamTemplate(team()).errors).toEqual([])
  })
})
