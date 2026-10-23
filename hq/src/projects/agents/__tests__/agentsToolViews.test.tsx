// @vitest-environment jsdom
/** The Agents tool's views (every screen reviewed spec §3): the list, an opened agent, Remove, Assign. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react; its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/agents')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return { Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Bot: icon, Check: icon }
})
import {
  ProjectAgentView, ProjectAgentRemove, ProjectAgentAssign,
  type ProjectAgentDetailData, type ProjectAgentRowData,
} from '@agenthix/ui/agents'
import { ProjectAgentsList } from '@agenthix/ui/projects'

const NOW = new Date('2026-10-08T12:00:00Z')
const avatar = (a: { name: string }) => <span>{a.name.slice(0, 2)}</span>
const modelLine = (id: string) => `models of ${id}`
const facts = { id: 'a1', name: 'Frontend dev', handle: 'frontend-dev', role: 'Builds the site', avatarUrl: null, coverUrl: null, approval: 'deferred' }
const idle = { state: 'idle' as const, lead: null, needsYouCount: 0, runningCount: 0, next: null }
const counts = { todo: 3, inProgress: 2, done: 14, needsYou: 0, running: 0, total: 19 }

function row(over: Partial<ProjectAgentRowData> = {}): ProjectAgentRowData {
  return { agent: facts, isDefault: false, now: idle, tasks: counts, narrowed: true, ...over }
}

function detail(over: Partial<ProjectAgentDetailData> = {}): ProjectAgentDetailData {
  return {
    ...row(), canManage: false, nowItems: [], comingUp: [],
    recentRuns: { runs: [] }, ...over,
  }
}

const noop = () => {}
function view(d: ProjectAgentDetailData, over: Partial<React.ComponentProps<typeof ProjectAgentView>> = {}) {
  return render(
    <ProjectAgentView
      detail={d} instructions={null} now={NOW} renderAvatar={avatar}
      onMoreTaskDetails={noop} onBack={noop} onOpenTasks={noop} onOpenRuns={noop} onOpenPlace={noop} onOpenFile={noop} {...over}
    />,
  )
}

describe('the list @SC-574', () => {
  const instructionFile = { path: 'AGENTS.md', text: 'Previews only.', modifiedAt: null, tooLarge: false }
  const render1 = (agents: ProjectAgentRowData[], over: Partial<React.ComponentProps<typeof ProjectAgentsList>> = {}) => render(
    <ProjectAgentsList
      agents={agents} everyAgent={{ file: instructionFile, skills: ['seo-audit'] }} now={NOW} renderAvatar={avatar} modelLine={modelLine}
      onOpenAgent={noop} onOpenFile={noop} {...over}
    />,
  )

  it('names what every agent follows, opening in Files', () => {
    const onOpenFile = vi.fn()
    render1([row()], { onOpenFile })
    fireEvent.click(screen.getByRole('button', { name: 'AGENTS.md' }))
    expect(onOpenFile).toHaveBeenCalledWith('AGENTS.md')
    fireEvent.click(screen.getByRole('button', { name: 'seo-audit' }))
    expect(onOpenFile).toHaveBeenCalledWith('.agents/skills/seo-audit')
  })

  it('shows what each agent is doing, its tasks by state and its model, marked when narrowed here', () => {
    const lead = { kind: 'needsYou' as const, taskId: 't1', key: 'WEB-27', title: 'Fix', projectId: 'p', projectName: 'Web', reason: 'wants to run a command', since: null }
    render1([row({ now: { state: 'needsYou', lead, needsYouCount: 1, runningCount: 0, next: null } })])
    expect(screen.getByText('Needs you')).toBeTruthy()
    expect(screen.getByText(/WEB-27 wants to run a command/)).toBeTruthy()
    expect(screen.getByText('To do 3 · In progress 2 · Done 14')).toBeTruthy()
    expect(screen.getByText('narrowed here')).toBeTruthy()
    expect(screen.getByText('1 needs you')).toBeTruthy()
  })

  it('opens the agent from the whole row, not only its name', () => {
    const onOpenAgent = vi.fn()
    render1([row()], { onOpenAgent })
    fireEvent.click(screen.getByText('To do 3 · In progress 2 · Done 14'))
    fireEvent.click(screen.getByText('Fr'))
    fireEvent.click(screen.getByRole('button', { name: 'Open Frontend dev' }))
    expect(onOpenAgent).toHaveBeenCalledTimes(3)
    expect(onOpenAgent).toHaveBeenCalledWith('a1')
  })

  it('offers ＋ Assign only where the person may assign', () => {
    const { unmount } = render1([row()])
    expect(screen.queryByRole('button', { name: '＋ Assign' })).toBeNull()
    unmount()
    const onAssign = vi.fn()
    render1([row()], { onAssign })
    fireEvent.click(screen.getByRole('button', { name: '＋ Assign' }))
    expect(onAssign).toHaveBeenCalled()
  })
})

describe('an agent opened inside the tool @SC-575', () => {
  it('gives a member no Remove from this project', () => {
    view(detail({ canManage: false }))
    expect(screen.queryByText('Remove from this project')).toBeNull()
  })

  it('shows Permissions here to every member, and scrolls to the part named @SC-620', () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.getAttribute('data-part') ?? this.textContent ?? '') }
    try {
      view(detail({ canManage: false }), { permissionsHere: <div data-part="permissions">Permissions here</div>, focus: 'permissions' })
    } finally {
      Element.prototype.scrollIntoView = original
    }
    expect(scrolled).toEqual(['Permissions here'])
  })

  it('gives the project’s admin Remove from this project', () => {
    const onRemove = vi.fn()
    view(detail({ canManage: true }), { onRemove })
    fireEvent.click(screen.getByText('Remove from this project'))
    expect(onRemove).toHaveBeenCalled()
  })

  it('offers no Remove to an agent that is here only through a team, and says to change it in the team', () => {
    const onRemove = vi.fn()
    view(detail({ canManage: true }), { onRemove, onlyThroughTeams: ['Marketing'] })
    expect(screen.queryByText('Remove from this project')).toBeNull()
    expect(screen.getByText('Here through Marketing. Change it in the team.')).toBeTruthy()
  })

  it('goes back to Members when it was opened from there', () => {
    view(detail(), { backLabel: 'Members' })
    expect(screen.getByRole('button', { name: /Members/ })).toBeTruthy()
  })

  it('opens Tasks, Runs, Files and the agent’s own place from where they are shown', () => {
    const p = { onOpenTasks: vi.fn(), onOpenRuns: vi.fn(), onOpenPlace: vi.fn(), onOpenFile: vi.fn() }
    const instructions = {
      organisation: { instructions: 'You build the site.' },
      everyAgent: { file: { path: 'AGENTS.md', text: 'Previews only.', modifiedAt: null, tooLarge: false }, skills: [] },
      forAgent: { file: { path: '.agents/agents/a1/instructions.md', text: null, modifiedAt: null, tooLarge: false }, skills: [] },
    }
    view(detail(), { ...p, instructions })
    fireEvent.click(screen.getByRole('button', { name: 'Open in Tasks' }))
    fireEvent.click(screen.getByRole('button', { name: 'All in Runs' }))
    fireEvent.click(screen.getByRole('button', { name: /Its own page under Agents/ }))
    const [everyAgent, forAgent] = screen.getAllByRole('button', { name: 'Open in Files' })
    fireEvent.click(everyAgent)
    fireEvent.click(forAgent)
    expect(p.onOpenTasks).toHaveBeenCalled()
    expect(p.onOpenRuns).toHaveBeenCalled()
    expect(p.onOpenPlace).toHaveBeenCalled()
    expect(p.onOpenFile).toHaveBeenNthCalledWith(1, 'AGENTS.md')
    expect(p.onOpenFile).toHaveBeenNthCalledWith(2, '.agents/agents/a1/instructions.md')
    expect(screen.getByText('You build the site.')).toBeTruthy()
  })

  it('starts a conversation, and gives it a task with the title typed', async () => {
    const onStartConversation = vi.fn()
    const onAddTask = vi.fn().mockResolvedValue(undefined)
    view(detail(), { onStartConversation, onAddTask })
    fireEvent.click(screen.getByRole('button', { name: 'Start a conversation' }))
    expect(onStartConversation).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Give it a task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'Pricing table' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onAddTask).toHaveBeenCalledWith('Pricing table'))
  })
})

describe('Remove from this project @SC-576', () => {
  const others = [{ id: 'a2', name: 'Project manager' }]
  const setup = () => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    render(<ProjectAgentRemove agentName="Frontend dev" openTasks={5} doneTasks={14} otherAgents={others} onRemove={onRemove} onCancel={noop} />)
    return onRemove
  }

  it('counts the open tasks and chooses nothing for the person, with Remove disabled', () => {
    setup()
    expect(screen.getByText(/5 open tasks/)).toBeTruthy()
    expect((screen.getByLabelText('Give them to') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText(/Leave them unassigned/) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('stays disabled on "Give them to" until an agent is picked, then sends openTasksTo', async () => {
    const onRemove = setup()
    fireEvent.click(screen.getByLabelText('Give them to'))
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Another agent here'), { target: { value: 'a2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('a2'))
  })

  it('sends null for leaving them unassigned', async () => {
    const onRemove = setup()
    fireEvent.click(screen.getByLabelText(/Leave them unassigned/))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(null))
  })

  it('cannot hand tasks to another agent when there is none', () => {
    render(<ProjectAgentRemove agentName="Frontend dev" openTasks={1} doneTasks={0} otherAgents={[]} onRemove={vi.fn()} onCancel={noop} />)
    expect((screen.getByLabelText('Give them to') as HTMLInputElement).disabled).toBe(true)
  })
})

describe("Remove the project's default agent @SC-576", () => {
  const others = [{ id: 'a2', name: 'Project manager' }]
  const removeButton = () => screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
  const setup = (otherAgents = others) => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    render(<ProjectAgentRemove agentName="Frontend dev" isDefault openTasks={5} doneTasks={14} otherAgents={otherAgents} onRemove={onRemove} onCancel={noop} />)
    return onRemove
  }

  it('is not asked when the agent is not the default', () => {
    render(<ProjectAgentRemove agentName="Frontend dev" openTasks={5} doneTasks={14} otherAgents={others} onRemove={vi.fn()} onCancel={noop} />)
    expect(screen.queryByText("The project's default agent becomes")).toBeNull()
  })

  it('asks for the new default with nothing chosen, and keeps Remove disabled until both are chosen', () => {
    setup()
    expect(screen.getByText("The project's default agent becomes")).toBeTruthy()
    expect((screen.getByLabelText(/No default agent/) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByLabelText(/Leave them unassigned/))
    expect(removeButton().disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/Make another agent the default/))
    expect(removeButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('The new default agent'), { target: { value: 'a2' } })
    expect(removeButton().disabled).toBe(false)
  })

  it('sends the new default with the choice for its open tasks', async () => {
    const onRemove = setup()
    fireEvent.click(screen.getByLabelText(/Leave them unassigned/))
    fireEvent.click(screen.getByLabelText(/Make another agent the default/))
    fireEvent.change(screen.getByLabelText('The new default agent'), { target: { value: 'a2' } })
    fireEvent.click(removeButton())
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(null, 'a2'))
  })

  it('sends null for no default', async () => {
    const onRemove = setup()
    fireEvent.click(screen.getByLabelText('Give them to'))
    fireEvent.change(screen.getByLabelText('Another agent here'), { target: { value: 'a2' } })
    expect(removeButton().disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/No default agent/))
    fireEvent.click(removeButton())
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('a2', null))
  })

  it('cannot make another agent the default when there is none', () => {
    setup([])
    expect((screen.getByLabelText(/Make another agent the default/) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('the list among other members @SC-574', () => {
  it('drops ＋ Assign, marks the default agent, and names the teams that bring an agent here', () => {
    render(
      <ProjectAgentsList
        agents={[row({ isDefault: true }), row({ agent: { ...facts, id: 'a2', name: 'Content writer' } })]} everyAgent={null} now={NOW} renderAvatar={avatar}
        modelLine={modelLine} onOpenAgent={noop} onOpenFile={noop} onAssign={noop} hideHeader teamsOf={id => (id === 'a2' ? ['Marketing'] : [])}
      />,
    )
    expect(screen.queryByRole('button', { name: '＋ Assign' })).toBeNull()
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByText('Marketing')).toBeTruthy()
  })
})

describe('Assign @SC-576', () => {
  it('lists the organisation’s agents that are not here, with their role, and assigns one', async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined)
    const onBack = vi.fn()
    render(
      <ProjectAgentAssign
        candidates={[{ id: 'a9', name: 'Designer', role: 'Layouts and images', avatarUrl: null }]} alreadyHere={['Frontend dev']}
        renderAvatar={avatar} onAssign={onAssign} onBack={onBack}
      />,
    )
    const item = screen.getByText('Designer').closest('li') as HTMLElement
    expect(within(item).getByText('Layouts and images')).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: 'Assign Designer' }))
    await waitFor(() => expect(onAssign).toHaveBeenCalledWith('a9'))
    await waitFor(() => expect(onBack).toHaveBeenCalled())
  })
})
