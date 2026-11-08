/** The task screens drawn from the design system: one control height, one toolbar row, one drawing per thing. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SearchField } from '../../primitives/FilterControls'
import { NativeSelect } from '../../primitives/NativeSelect'
import { DateField, fieldDayText } from '../../primitives/DateField'
import { TasksToolHeader } from '../TasksToolHeader'
import { TasksScorecards } from '../TasksScorecards'
import { TasksList } from '../TasksList'
import { TaskInTool } from '../TaskInTool'
import { TaskActivityList } from '../TaskActivityList'
import { ProgressRing } from '../TaskMarks'
import { CommentsSection } from '../CommentsSection'
import type { TaskListRow } from '../taskListTypes'
import { Button } from '../../primitives/Button'
import { SortMenu } from '../../primitives/Menus'
import { NO_COUNTS, narrowedLine, scorecardsOf } from '../taskListWords'

afterEach(cleanup)

const NO_OPTIONS = { types: [], columns: [], epics: [{ id: 'e1', name: 'Launch' }], sprints: [], agents: [], projects: [], fields: [] }

const row = (over: Partial<TaskListRow> = {}): TaskListRow => ({
  id: 't1', key: 'WEB-2', number: 2, title: 'Write the home page copy', priority: 'HIGH', state: 'IN_PROGRESS', executionState: 'FAILED',
  type: { name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: 'c1', name: 'In progress' },
  project: { id: 'p1', key: 'WEB', name: 'Website relaunch' }, agent: { id: 'a1', name: 'Writer', handle: 'writer' }, runDetail: null,
  epic: { id: 'e1', title: 'Launch the new website' }, sprint: { id: 's4', name: 'Sprint 4' }, due: null, late: false, fields: {},
  updatedAt: '2026-11-05T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', progress: null, ...over,
})

const list = (rows: TaskListRow[], extra: Partial<Parameters<typeof TasksList>[0]> = {}) => render(
  <TasksList rows={rows} kind="project" now={new Date(2026, 10, 6)} onOpen={() => {}} emptyText="No tasks yet." {...extra} />,
)

describe('the controls', () => {
  it('draws the search box in a block label, so the spacing given to it applies, at the toolbar height', () => {
    render(<SearchField label="Search tasks" value="" onChange={() => {}} className="mt-3" />)
    const input = screen.getByRole('searchbox', { name: 'Search tasks' })
    expect(input.closest('label')!.className).toMatch(/\bblock\b/)
    expect(input.className).toMatch(/\bh-9\b/)
    expect(input.className).toMatch(/max-sm:h-11/)
  })

  it('clears the search with its own muted button in place of the browser’s', () => {
    const onChange = vi.fn()
    render(<SearchField label="Search tasks" value="home" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear search tasks' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('draws a select without the operating system’s look, with the app’s chevron, at one height', () => {
    render(<NativeSelect aria-label="Board"><option>Launch plan</option></NativeSelect>)
    const select = screen.getByRole('combobox', { name: 'Board' })
    expect(select.className).toMatch(/appearance-none/)
    expect(select.className).toMatch(/bg-surface-1/)
    expect(select.className).toMatch(/\bh-9\b/)
    expect(select.parentElement!.querySelector('svg')).toBeTruthy()
  })

  it('writes a date field’s day the app’s way, the year only when it is not this year', () => {
    const now = new Date(2026, 10, 6)
    expect(fieldDayText('2026-04-10', false, now)).toBe('10 Apr')
    expect(fieldDayText('2027-04-10', false, now)).toBe('10 Apr 2027')
    expect(fieldDayText('2026-04-11T19:30', true, now)).toBe('11 Apr, 19:30')
    render(<DateField aria-label="Plan start" value="" emptyText="Start" onChange={() => {}} />)
    const input = screen.getByLabelText('Plan start')
    expect(input.className).toMatch(/\bh-9\b/)
    expect(screen.getByText('Start')).toBeTruthy()
  })
})

describe("a list's toolbar", () => {
  it('is one row: search, the chips, ＋ Filter, then Sort', () => {
    render(
      <TasksToolHeader
        kind="project" search="" onSearch={() => {}} filters={{ epicId: 'e1' }} onFilters={() => {}}
        options={NO_OPTIONS} sort="rank" onSort={() => {}}
      />,
    )
    const bar = screen.getByRole('toolbar', { name: 'Search, filter and sort' })
    expect(bar.className).toMatch(/\bflex\b/)
    expect(bar.className).not.toMatch(/space-y/)
    const children = Array.from(bar.children)
    expect(children[0].tagName).toBe('LABEL')
    expect(children[1].textContent).toContain('Epic: Launch')
    expect(within(bar).getByRole('button', { name: 'Filter' }).className).toMatch(/border-dashed/)
    expect(within(bar).getByRole('button', { name: /Sort: Rank/ }).className).toMatch(/\bh-9\b/)
  })

  it('heads a filter’s choices with the way back, not as one more choice', () => {
    render(
      <TasksToolHeader
        kind="project" search="" onSearch={() => {}} filters={{}} onFilters={() => {}} options={NO_OPTIONS} sort="rank" onSort={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Epic' }))
    const menu = screen.getByRole('menu', { name: 'Epic' })
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Launch'])
    fireEvent.click(within(menu).getByRole('button', { name: 'Back to Filter by' }))
    expect(screen.getByRole('menu', { name: 'Filter by' })).toBeTruthy()
  })
})

describe('the scorecards', () => {
  it('mark the chosen card with the accent outline and fill, and share the row from sm up', () => {
    const cards = [{ card: null, label: 'All', count: 8, detail: null }, { card: 'done' as const, label: 'Done', count: 1, detail: null }]
    render(<TasksScorecards cards={cards} chosen="done" onChoose={() => {}} />)
    const group = screen.getByRole('group', { name: 'Tasks by state' })
    expect(group.className).toMatch(/sm:grid-cols-\[repeat\(auto-fit/)
    const done = screen.getByRole('button', { name: /Done/ })
    expect(done.className).toMatch(/border-accent bg-accent-subtle/)
    expect(done.className).toMatch(/hover:border-accent/)
    expect(done.className).not.toMatch(/hover:bg-surface-hover/)
  })
})

describe('a task row', () => {
  it('tells the column, priority, epic and sprint apart, keeps the title to one line, and keeps the avatar slot', () => {
    list([row(), row({ id: 't2', key: 'WEB-6', title: 'Set up redirects', agent: null, epic: null, sprint: null, priority: 'LOW' })])
    const [first, second] = screen.getAllByRole('listitem')
    expect(within(first).getByRole('button', { name: 'Write the home page copy' }).className).toMatch(/truncate/)
    expect(within(first).getAllByText('In progress')[0].className).toMatch(/ring-inset/)
    expect(within(first).getAllByTestId('priority-flag')[0].textContent).toBe('High')
    expect(within(first).getByTestId('epic-fact').textContent).toBe('Launch the new website')
    expect(within(first).getAllByTestId('sprint-tag')[0].className).toMatch(/border-accent/)
    expect(within(second).getAllByTestId('no-agent').length).toBeGreaterThan(0)
  })

  it('draws the run only as the agent’s ring, with no next-step button beside it', () => {
    list([row()])
    expect(screen.queryByRole('button', { name: /Run again|Review/ })).toBeNull()
    expect(screen.getAllByTestId('run-mark')[0].textContent).toBe('!')
  })

  it('shows an empty list as the inline empty state with its way out, and no column header', () => {
    list([], { emptyText: 'No task matches your search and filters.', emptyAction: <button>Clear search and filters</button> })
    expect(screen.queryByText('Agent · state')).toBeNull()
    expect(screen.getByText('No task matches your search and filters.').closest('div')!.className).toMatch(/border-dashed/)
    expect(screen.getByRole('button', { name: 'Clear search and filters' })).toBeTruthy()
  })

  it('draws an epic’s progress with the one ring, in two sizes', () => {
    render(<><ProgressRing done={1} total={4} /><ProgressRing done={1} total={4} size="lg" /></>)
    const rings = screen.getAllByRole('img', { name: '1 of 4 done' })
    expect(rings.map(r => r.querySelector('svg')!.getAttribute('width'))).toEqual(['14', '44'])
    expect(rings.every(r => r.querySelectorAll('circle')[1].getAttribute('stroke') === 'var(--color-success)')).toBe(true)
  })
})

describe("a task's page", () => {
  it('keeps the first row to its content’s height, so the tabs sit under Now whatever the Details’ height', () => {
    const { container } = render(
      <TaskInTool header={<div />} title={<h1>T</h1>} description={null} now={<div>now</div>} tabs={<div>tabs</div>} details={<div>details</div>} />,
    )
    const grid = container.querySelector('.grid')!
    expect(grid.className).toMatch(/@2xl:grid-rows-\[auto_1fr\]/)
    expect(screen.getByText('tabs').parentElement!.className).toMatch(/@2xl:self-start/)
  })

  it('says an empty Activity with the inline empty state', () => {
    render(<TaskActivityList lines={[]} />)
    expect(screen.getByText('Nothing has happened to this task yet.').closest('div')!.className).toMatch(/border-dashed/)
  })

  it('writes a comment’s time as the page does and draws the agent’s own avatar, its kind in muted words', () => {
    render(
      <CommentsSection
        comments={[{ id: 'c', content: 'Done.', createdAt: new Date(2026, 3, 11, 19, 30).toISOString(), authorType: 'AGENT', agentName: 'Writer' }]}
        commentDraft="" setCommentDraft={() => {}} commentBusy={false} now={new Date(2026, 10, 6)}
      />,
    )
    const c = screen.getByTestId('task-comment')
    expect(c.querySelector('time')!.textContent).toBe('11 Apr, 19:30')
    expect(within(c).getByText('W')).toBeTruthy()
    expect(within(c).getByText('Agent').className).toMatch(/text-text-muted/)
  })
})

describe('round 2 of the design check', () => {
  it('opens the Filter menu from its right edge, so it stays inside the panel, and fills the open button', () => {
    render(<TasksToolHeader kind="project" search="" onSearch={() => {}} filters={{}} onFilters={() => {}} options={NO_OPTIONS} sort="rank" onSort={() => {}} />)
    const filter = screen.getByRole('button', { name: 'Filter' })
    fireEvent.click(filter)
    expect(screen.getByRole('menu', { name: 'Filter by' }).className).toMatch(/sm:right-0/)
    expect(filter.className).toMatch(/aria-expanded:bg-selected/)
  })

  it('draws every search box alike, white', () => {
    render(<SearchField label="Search tasks" value="" onChange={() => {}} prominent />)
    expect(screen.getByRole('searchbox').className).toMatch(/bg-surface-1/)
    expect(screen.getByRole('searchbox').className).not.toMatch(/bg-surface-0/)
  })

  it('rings a focused button in the accent colour outside a gap, and makes it 44 px on a phone', () => {
    render(<Button>New task</Button>)
    const b = screen.getByRole('button', { name: 'New task' })
    expect(b.className).toMatch(/focus-visible:shadow-\[0_0_0_2px_var\(--color-surface-1\),0_0_0_4px_var\(--color-accent\)\]/)
    expect(b.className).toMatch(/max-sm:min-h-11/)
  })

  it('gives every row one shape by the list’s width: columns beside it on a wide list, the column and date on line 2 otherwise', () => {
    list([row({ due: '2026-11-12' })])
    const title = screen.getByRole('button', { name: 'Write the home page copy' })
    expect(title.parentElement!.className).not.toMatch(/flex-wrap/)
    expect(screen.getByTestId('line-narrow').className).toMatch(/@2xl:hidden/)
    expect(screen.getByTestId('list-header').className).toMatch(/@2xl:grid/)
  })

  it('leaves the epic off a row listed under it, and draws the project in words, not as a chip', () => {
    render(<TasksList rows={[row()]} kind="mine" now={new Date(2026, 10, 6)} onOpen={() => {}} emptyText="" underEpic />)
    expect(screen.queryByTestId('epic-fact')).toBeNull()
    expect(screen.getAllByTestId('row-project')[0].className).not.toMatch(/ring/)
  })

  it('counts what is shown against what the list holds when narrowed, and keeps the cards while loading', () => {
    expect(narrowedLine({ shown: 0, total: 8 })).toBe('0 of 8 tasks')
    render(<TasksScorecards cards={scorecardsOf(NO_COUNTS, 'project')} chosen={null} onChoose={() => {}} loading />)
    expect(screen.getAllByText('…').length).toBe(7)
  })

  it('is the one Sort control: a menu with a check on the chosen order', () => {
    const onChange = vi.fn()
    render(<SortMenu value="name" choices={[{ value: 'name', label: 'Name' }, { value: 'added', label: 'Recently added' }]} onChange={onChange} />)
    const sort = screen.getByRole('button', { name: /Sort: Name/ })
    fireEvent.click(sort)
    expect(sort.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Recently added' }))
    expect(onChange).toHaveBeenCalledWith('added')
  })
})

describe('round 3 of the design check', () => {
  it('says the All card counts what matches while a search or filter is on, and shows no number after a failed read', () => {
    const cards = scorecardsOf(NO_COUNTS, 'project')
    const { unmount } = render(<TasksScorecards cards={cards} chosen={null} onChoose={() => {}} matching />)
    expect(screen.getByRole('button', { name: /All/ }).textContent).toContain('matching')
    unmount()
    render(<TasksScorecards cards={cards} chosen={null} onChoose={() => {}} loading failed />)
    expect(screen.getAllByText('–').length).toBe(7)
  })

  it('rings a focused menu item inside the menu, and gives focus back to the button that opened it', () => {
    render(<SortMenu value="name" choices={[{ value: 'name', label: 'Name' }, { value: 'added', label: 'Recently added' }]} onChange={() => {}} />)
    const sort = screen.getByRole('button', { name: /Sort: Name/ })
    sort.focus()
    fireEvent.click(sort)
    const item = screen.getByRole('menuitemradio', { name: 'Recently added' })
    expect(item.className).toMatch(/focus-visible:ring-inset/)
    fireEvent.click(item)
    expect(document.activeElement).toBe(sort)
  })
})
