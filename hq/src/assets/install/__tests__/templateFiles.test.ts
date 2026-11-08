import { describe, it, expect } from 'vitest'
import { readAgentTemplate, readBoardTemplate, readTaskTemplateFile, validateTemplate } from '../templateFiles'

const f = (path: string, value: unknown) => ({ path, content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) })
const COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280' },
  { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', color: '#f59e0b', autoQueue: true, hint: 'Move here when started.' },
  { name: 'done', label: 'Done', status: 'DONE', color: '#10b981' },
]
const agent = (over: Record<string, unknown> = {}) => [
  f('agent.json', { name: 'QA', handle: 'qa', role: 'Checks', approval: 'deferred', ...over }), f('instructions.md', '# QA'),
]

describe("an agent template's files @SC-1636", () => {
  it('reads only the fields it knows, bounded', () => {
    expect(readAgentTemplate(agent({ extra: 'ignored', allowedTools: ['read_file'] }))).toEqual({
      name: 'QA', handle: 'qa', role: 'Checks', approval: 'deferred', allowedTools: ['read_file'], allowedBashPatterns: null,
    })
  })

  it('refuses a handle that names a path, an unknown approval, a name over one line, and missing instructions', () => {
    expect(validateTemplate('agent', agent({ handle: '../escape' })).errors[0]).toMatch(/handle/i)
    expect(validateTemplate('agent', agent({ approval: 'always' })).errors[0]).toMatch(/approval/)
    expect(validateTemplate('agent', agent({ name: 'a\nb' })).errors[0]).toMatch(/one line/)
    expect(validateTemplate('agent', [f('agent.json', { name: 'QA', handle: 'qa' })]).errors[0]).toMatch(/instructions\.md/)
    expect(validateTemplate('agent', [f('agent.json', '[')]).errors[0]).toMatch(/not valid JSON/)
    expect(validateTemplate('agent', agent()).errors).toEqual([])
  })
})

describe("a board template's files @SC-1636", () => {
  it('reads its columns in the order listed', () => {
    const board = readBoardTemplate([f('board.json', { name: 'Flow', columns: COLUMNS })])
    expect(board.columns.map(c => [c.name, c.order])).toEqual([['todo', 0], ['doing', 1], ['done', 2]])
    expect(board.columns[1]).toMatchObject({ autoQueue: true, hint: 'Move here when started.' })
  })

  it('refuses a missing state, a Backlog column, two of one name, a bad colour, and skills', () => {
    const errors = (columns: unknown[], extra: Array<ReturnType<typeof f>> = []) => validateTemplate('board', [f('board.json', { name: 'B', columns }), ...extra]).errors
    expect(errors(COLUMNS.slice(0, 2))[0]).toMatch(/missing DONE/)
    expect(errors([...COLUMNS, { ...COLUMNS[0], name: 'backlog' }])[0]).toMatch(/Backlog/)
    expect(errors([...COLUMNS, COLUMNS[0]])[0]).toMatch(/same name/)
    expect(errors([{ ...COLUMNS[0], color: 'red' }, ...COLUMNS.slice(1)])[0]).toMatch(/colour/)
    expect(errors(COLUMNS, [f('skills/x/SKILL.md', 'x')])).toEqual(['A board template carries no skills.'])
    expect(errors(Array.from({ length: 30 }, (_, i) => ({ ...COLUMNS[i % 3], name: `c${i}` })))[0]).toMatch(/1 to 20 columns/)
  })
})

describe("a task template's files", () => {
  const bug = { name: 'Bug', icon: 'bug', columns: [
    { name: 'Reported', state: 'BACKLOG' }, { name: 'Triaged', state: 'TODO' }, { name: 'Fixing', state: 'IN_PROGRESS' }, { name: 'Verified', state: 'DONE' },
  ] }
  const tpl = (content: unknown, extra: Array<ReturnType<typeof f>> = []) => [f('task-template.json', content), ...extra]

  it('reads its types and fields from task-template.json', () => {
    expect(readTaskTemplateFile(tpl({ types: [bug] })).types[0]!.columns.map(c => c.name)).toEqual(['Reported', 'Triaged', 'Fixing', 'Verified'])
    expect(validateTemplate('task-template', tpl({ types: [bug] })).errors).toEqual([])
  })

  it('refuses a missing file, a type missing a state, and skills', () => {
    expect(validateTemplate('task-template', [f('board.json', {})]).errors[0]).toMatch(/task-template\.json/)
    expect(validateTemplate('task-template', tpl({ types: [{ ...bug, columns: bug.columns.slice(0, 3) }] })).errors[0]).toMatch(/Done needs at least one column/)
    expect(validateTemplate('task-template', tpl({ types: [bug] }, [f('skills/x/SKILL.md', 'x')])).errors).toEqual(['A task template carries no skills.'])
  })
})
