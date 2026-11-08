import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/client/operations', () => ({}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: null }) }))
vi.mock('../ChatAgentsTool', () => ({ ChatAgentsTool: () => null }))
vi.mock('../../projects/pages/ProjectTasksPage', () => ({ ProjectTasksPage: () => null }))
vi.mock('../../projects/pages/ProjectBoardsPage', () => ({ ProjectBoardsPage: () => null }))
vi.mock('../../runs/pages/ProjectRunsTool', () => ({ ProjectRunsTool: () => null }))
vi.mock('../../projects/place/ProjectRunControls', () => ({ ProjectRunControls: () => null }))
vi.mock('../../projects/place/projectToolViews', () => ({ ProjectAutomationTool: () => null }))
vi.mock('../../projects/routines/RoutinesTool', () => ({ RoutinesTool: () => null }))
vi.mock('../../storage/pages/filesToolGroup', () => ({
  filesToolGroup: ({ counts }: { counts: Record<string, string | undefined> }) => ({
    label: 'Files',
    tools: ['files', 'artefacts', 'knowledge', 'workspaces'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), count: counts[id], render: () => null })),
  }),
}))

import { chatFacts, chatToolGroups } from '../chatPlace'

const space = {
  userId: 'u1',
  siteLabel: null,
  filesCounts: {},
  project: { id: 'p1', key: 'ME', tasks: [{ state: 'TODO', runState: 'RUN_BLOCKED' }, { state: 'TODO', runState: null }], boards: [{ id: 'b1' }] },
  runs: [{}],
}

describe('chatFacts @SC-507', () => {
  it('says who sees it, which agents, and the personal files', () => {
    expect(chatFacts(null).map((f) => f.label)).toEqual(['Who sees it', 'Agents', 'Personal projects', 'Files'])
    expect(chatFacts(null).filter((f) => typeof f.value === 'string').map((f) => f.value)).toEqual(['Only you', 'Your personal files'])
  })

  it('shows the Site only once the person’s storage has one', () => {
    expect(chatFacts({ id: 's1', label: 'Development' }).map((f) => f.label)).toEqual(['Who sees it', 'Agents', 'Personal projects', 'Site', 'Files'])
    expect(chatFacts({ id: 's1', label: 'Development' }).find((f) => f.label === 'Site')?.value).toBe('Development')
  })
})

describe('chatToolGroups @SC-507', () => {
  it('counts the four Files tools once their lists are read', () => {
    const tools = chatToolGroups({ ...space, filesCounts: { files: '24', artefacts: '9', knowledge: '6 topics', workspaces: '3' } }).flatMap((g) => g.tools)
    expect(['files', 'artefacts', 'knowledge', 'workspaces'].map((id) => tools.find((t) => t.id === id)?.count)).toEqual(['24', '9', '6 topics', '3'])
  })

  it('holds Work, Agents at work, and Files — no Agents, People or Settings', () => {
    const groups = chatToolGroups(space)
    expect(groups.map((g) => [g.label, g.tools.map((t) => t.label)])).toEqual([
      ['Work', ['Tasks', 'Boards']],
      ['Agents at work', ['Runs', 'Routines', 'Automation']],
      ['Files', ['Files', 'Artefacts', 'Knowledge', 'Workspaces']],
    ])
    expect(groups[1].footer).toBeTruthy()
  })

  it('counts the personal tasks, boards and runs, and gives Automation no on or off: nothing is switched (adr-0175)', () => {
    const tools = chatToolGroups(space).flatMap((g) => g.tools)
    const count = (id: string) => tools.find((t) => t.id === id)
    // The Tasks list's All, never a run state.
    expect(count('tasks')).toMatchObject({ count: '2' })
    expect(count('tasks')?.tone).toBeUndefined()
    expect(count('boards')).toMatchObject({ count: '2' })
    expect(count('runs')).toMatchObject({ count: '1 running', tone: 'live' })
    expect(count('automation')?.count).toBeUndefined()
  })

  it('leaves the counts out until their data arrives', () => {
    const tools = chatToolGroups({ ...space, project: undefined, runs: undefined }).flatMap((g) => g.tools)
    expect(tools.map((t) => t.count)).toEqual(Array(9).fill(undefined))
  })
})
