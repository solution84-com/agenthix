import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/client/operations', () => ({}))
vi.mock('../ChatAgentsTool', () => ({ ChatAgentsTool: () => null }))
vi.mock('../../projects/pages/ProjectTasksPage', () => ({ ProjectTasksPage: () => null }))
vi.mock('../../projects/pages/ProjectBoardsPage', () => ({ ProjectBoardsPage: () => null }))
vi.mock('../../projects/place/ProjectRunsTool', () => ({ ProjectRunsTool: () => null }))
vi.mock('../../projects/place/ProjectRunControls', () => ({ ProjectRunControls: () => null }))
vi.mock('../../projects/place/projectToolViews', () => ({ ProjectAutomationTool: () => null }))
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
  project: { id: 'p1', key: 'ME', tasks: [{ status: 'TODO', runState: 'RUN_BLOCKED' }, { status: 'TODO', runState: null }], boards: [{ id: 'b1' }] },
  runs: [{}],
  automationOn: true,
}

describe('chatFacts @SC-507', () => {
  it('says who sees it, which agents, and the personal files', () => {
    expect(chatFacts(null).map((f) => f.label)).toEqual(['Who sees it', 'Agents', 'Files'])
    expect(chatFacts(null).filter((f) => typeof f.value === 'string').map((f) => f.value)).toEqual(['Only you', 'Your personal files'])
  })

  it('shows the Site only once the person’s storage has one', () => {
    expect(chatFacts({ id: 's1', label: 'Development' }).map((f) => f.label)).toEqual(['Who sees it', 'Agents', 'Site', 'Files'])
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
      ['Agents at work', ['Runs', 'Automation']],
      ['Files', ['Files', 'Artefacts', 'Knowledge', 'Workspaces']],
    ])
    expect(groups[1].footer).toBeTruthy()
  })

  it('counts the personal tasks, boards and runs, and says whether automation is on', () => {
    const tools = chatToolGroups(space).flatMap((g) => g.tools)
    const count = (id: string) => tools.find((t) => t.id === id)
    expect(count('tasks')).toMatchObject({ count: '1 needs you · 2', tone: 'needs' })
    expect(count('boards')).toMatchObject({ count: '1' })
    expect(count('runs')).toMatchObject({ count: '1 running', tone: 'live' })
    expect(count('automation')).toMatchObject({ count: 'On', tone: 'live' })
  })

  it('leaves the counts out until their data arrives', () => {
    const tools = chatToolGroups({ ...space, project: undefined, runs: undefined, automationOn: undefined }).flatMap((g) => g.tools)
    expect(tools.map((t) => t.count)).toEqual(Array(8).fill(undefined))
  })
})
