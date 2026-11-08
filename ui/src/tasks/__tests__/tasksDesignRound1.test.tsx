import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TasksListHeading } from '../TasksListHeading'
import { TasksToolHeader } from '../TasksToolHeader'
import { TasksScorecards } from '../TasksScorecards'
import { TasksList } from '../TasksList'
import { NO_COUNTS, scorecardsOf } from '../taskListWords'
import type { TaskListRow } from '../taskListTypes'
import { PhoneColumns } from '../../board/PhoneColumns'
import type { ViewCardData, ViewColumnData } from '../../board/types'

afterEach(cleanup)

const EDGE = /\bpx-6\b.*\bmax-lg:px-3\b/
const NO_OPTIONS = { types: [], columns: [], epics: [], sprints: [], agents: [], projects: [], fields: [] }
const row = (over: Partial<TaskListRow> = {}): TaskListRow => ({
  id: 't1', key: 'WEB-2', number: 2, title: 'Write the home page copy', priority: 'HIGH', state: 'TODO', executionState: 'NOT_STARTED',
  type: { name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: 'c1', name: 'To do' },
  project: { id: 'p1', key: 'WEB', name: 'Website relaunch' }, agent: null, runDetail: null,
  epic: null, sprint: null, due: null, late: false, fields: {},
  updatedAt: '2026-11-05T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', progress: null, ...over,
})

describe('the task lists’ edges: the screen bar’s 24 px, 12 px on a phone', () => {
  it('puts the heading, scorecards, toolbar and list on one edge', () => {
    render(
      <>
        <TasksListHeading title="Tasks" counts="3 tasks" />
        <TasksScorecards cards={scorecardsOf(NO_COUNTS, 'project')} chosen={null} onChoose={() => {}} />
        <TasksToolHeader kind="project" search="" onSearch={() => {}} filters={{}} onFilters={() => {}} options={NO_OPTIONS} sort="rank" onSort={() => {}} />
        <TasksList rows={[row()]} kind="project" now={new Date(2026, 10, 6)} onOpen={() => {}} emptyText="" />
      </>,
    )
    expect(screen.getByTestId('list-heading').className).toMatch(EDGE)
    expect(screen.getByRole('group', { name: 'Tasks by state' }).className).toMatch(EDGE)
    expect(screen.getByRole('toolbar', { name: 'Search, filter and sort' }).className).toMatch(EDGE)
    expect(screen.getByTestId('list-header').parentElement!.className).toMatch(EDGE)
  })
})

describe('the heading row on a phone', () => {
  it('is not drawn when the top bar holds its title and action and there is no line under it', () => {
    render(<TasksListHeading title="Tasks" counts={null} compact action={<button type="button">New task</button>} />)
    expect(screen.getByTestId('list-heading').className).toMatch(/max-lg:hidden/)
  })

  it('stays when it has a line to show, or is not compact', () => {
    render(<TasksListHeading title="Tasks" counts="3 of 9 tasks" compact />)
    expect(screen.getByTestId('list-heading').className).not.toMatch(/max-lg:hidden/)
    cleanup()
    render(<TasksListHeading title="Tasks" counts={null} />)
    expect(screen.getByTestId('list-heading').className).not.toMatch(/max-lg:hidden/)
  })
})

describe('Your tasks rows', () => {
  it('put a folder mark before the project’s name, wide and narrow', () => {
    render(<TasksList rows={[row()]} kind="mine" now={new Date(2026, 10, 6)} onOpen={() => {}} emptyText="" />)
    expect(screen.getByTestId('row-project').querySelector('svg.lucide-folder')).toBeTruthy()
    expect(screen.getByTestId('row-project-narrow').querySelector('svg.lucide-folder')).toBeTruthy()
    expect(screen.getByTestId('row-project').textContent).toBe('Website relaunch')
  })
})

describe('a board on a phone', () => {
  const card: ViewCardData = {
    id: 't14', key: 'WEB-14', title: 'Fix the contact form', priority: 'HIGH',
    type: { id: 'bug', name: 'Bug', icon: 'bug', kind: 'CUSTOM' }, state: 'TODO', executionState: 'NOT_STARTED', agent: null,
  }
  const columns: ViewColumnData[] = [{ key: 't', name: 'Triaged', state: 'TODO', count: 3, cards: [card] }]

  it('draws the column’s name, count and its 44 px ⋯ above its cards', () => {
    render(
      <PhoneColumns
        columns={columns} current="t" onColumn={() => {}} showType={false} held={null} onOpen={() => {}} onHold={() => {}} emptyWords=""
        columnMenu={() => [{ label: 'Hide', onSelect: () => {} }]}
      />,
    )
    const heading = screen.getByTestId('phone-column-heading')
    expect(heading.textContent).toContain('Triaged')
    expect(heading.textContent).toContain('3')
    const more = screen.getByRole('button', { name: 'Triaged column menu' })
    expect(more.className).toMatch(/\bh-11\b/)
    fireEvent.click(more)
    expect(screen.getByRole('menuitem', { name: 'Hide' })).toBeTruthy()
  })
})
