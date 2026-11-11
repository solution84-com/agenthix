import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectOverviewView } from '../ProjectOverviewView'
import type { ProjectPreviewData } from '../types'

const person = (id: string, name: string) => ({ userId: id, name, handle: id, avatarUrl: null, state: 'active' as const })
const agent = (id: string, name: string, role: string | null) => ({ id, name, handle: id, role, avatarUrl: null })

function preview(patch: Partial<ProjectPreviewData> = {}, project: Partial<ProjectPreviewData['project']> = {}): ProjectPreviewData {
  return {
    project: {
      id: 'p1', key: 'AB', name: 'Alpha', description: 'The alpha site', accessLevel: 'OPEN', startedAt: '2030-01-01T00:00:00.000Z',
      product: null, site: { id: 's1', label: 'main-site' }, lead: person('u1', 'Priya Nair'), defaultAgentId: 'a1', ...project,
    },
    isMember: false, canJoin: true,
    people: [person('u1', 'Priya Nair'), person('u2', 'Sam Okafor')],
    agents: [agent('a1', 'Writer', 'drafts copy'), agent('a2', 'Reviewer', null)],
    taskCount: 16, openTaskCount: 3, runningCount: 1, doneCount: 12, boardCount: 2, lastRunAt: null,
    ...patch,
  }
}

function view(p: ProjectPreviewData, extra: Partial<Parameters<typeof ProjectOverviewView>[0]> = {}) {
  return render(
    <ProjectOverviewView
      preview={p} now={new Date()} renderPersonAvatar={() => null} renderAgentAvatar={() => null}
      joining={false} onJoin={() => {}} {...extra}
    />,
  )
}

describe('a project you are in', () => {
  it('shows the work on the left and the lead, people and agents on the right', () => {
    view(preview({ isMember: true, canJoin: false }), { work: <div>the member's lists</div> })
    expect(screen.getByText("the member's lists")).toBeTruthy()
    expect(screen.queryByText('Join project')).toBeNull()
    expect(screen.getByRole('region', { name: 'Lead' }).textContent).toContain('Priya Nair')
    expect(screen.getByRole('region', { name: 'People' }).textContent).toContain('Priya Nair and Sam Okafor')
    const agents = screen.getByRole('region', { name: 'Agents' })
    expect(agents.textContent).toContain('Default agent · drafts copy')
    expect(agents.textContent).toContain('Reviewer')
    expect(screen.getByText(/Open project · started .* · on main-site/)).toBeTruthy()
  })
})

describe('a project you are not in', () => {
  it('shows counts and a faded shape, Join project, and no work', () => {
    const onJoin = vi.fn()
    view(preview(), { onJoin, work: <div>SECRET TASK TITLE</div> })
    expect(screen.queryByText('SECRET TASK TITLE')).toBeNull()
    expect(screen.getByTestId('work-counts').textContent).toContain('12done')
    expect(screen.getByText('Join to see its tasks and boards')).toBeTruthy()
    fireEvent.click(screen.getByText('Join project'))
    expect(onJoin).toHaveBeenCalled()
  })

  it('tells a person who cannot join what to do instead', () => {
    view(preview({ canJoin: false }))
    const join = screen.getByRole('button', { name: 'Join project' })
    expect(join.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(join)
    expect(screen.getByTestId('tooltip').textContent).toMatch(/Ask someone in it, or an admin, to add you/)
    fireEvent.click(join)
    expect(screen.getByRole('alert').textContent).toMatch(/Ask someone in it, or an admin, to add you/)
  })
})

describe('an empty project', () => {
  it('says what is missing in each card with one link to add it', () => {
    const calls: string[] = []
    view(
      preview({ isMember: true, canJoin: false, taskCount: 0, people: [], agents: [] }, { lead: null, description: null }),
      {
        actions: {
          newTask: () => calls.push('task'), chooseLead: () => calls.push('lead'), addPeople: () => calls.push('people'),
          assignAgent: () => calls.push('agent'), addDescription: () => calls.push('description'),
        },
      },
    )
    expect(screen.getByText('No tasks yet')).toBeTruthy()
    for (const name of ['New task', 'Choose one', 'Add people', 'Assign an agent', '＋ Add a description']) fireEvent.click(screen.getByText(name))
    expect(calls).toEqual(['task', 'lead', 'people', 'agent', 'description'])
    expect(screen.queryByText(/Get started/)).toBeNull()
  })
})
