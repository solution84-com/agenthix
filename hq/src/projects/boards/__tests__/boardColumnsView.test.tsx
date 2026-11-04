// @vitest-environment jsdom
/** A board's columns in their three layouts, Show also, and the menus on cards and on the board (every screen reviewed spec §3). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see tasksToolViews.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()),
    Plus: icon, Search: icon, ChevronLeft: icon, MoreHorizontal: icon, Send: icon, ChevronDown: icon, ChevronRight: icon,
    Loader2: icon, Check: icon, Copy: icon, Bot: icon, Sparkles: icon, CheckCircle: icon, XCircle: icon,
  }
})
// dnd-kit would load the ui's own copy of React here; side by side, only what is drawn matters.
const uiDndPaths = vi.hoisted(() => {
  const req = require('node:module').createRequire(require.resolve('@agenthix/ui/board'))
  return { core: req.resolve('@dnd-kit/core'), utilities: req.resolve('@dnd-kit/utilities') }
})
vi.mock(uiDndPaths.core, () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ isOver: false, setNodeRef: () => {} }),
}))
vi.mock(uiDndPaths.utilities, () => ({ CSS: { Translate: { toString: () => '' } } }))
import { BoardColumnsView, cardStateText, type ColumnsViewProps } from '@agenthix/ui/board'
import { boardMenuItems } from '../boardMenu'
import { cardMenuItems } from '../cardMenu'
import { screenOf } from '../useBoardsToolUrl'
import { card, COLUMNS } from './boardFixtures'

const NOW = new Date('2026-10-08T12:00:00Z')

function view(over: Partial<ColumnsViewProps> = {}) {
  const props: ColumnsViewProps = {
    layout: 'stacked', boardId: 'b1', columns: COLUMNS, cards: [], backlog: [], showAlso: [], now: NOW,
    onOpen: vi.fn(), menuFor: () => [], ...over,
  }
  render(<BoardColumnsView {...props} />)
  return props
}

/** Opens a column's "⋯" and picks one of its entries. */
function choose(column: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: `${column} column menu` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

describe('stacked columns, when narrow @SC-559', () => {
  const cards = [
    card({ title: 'Pricing table component', column: 'todo' }),
    card({ title: 'Fix the checkout redirect', column: 'doing', runState: 'RUN_BLOCKED', needsYou: true, runStateReason: 'Awaiting tool approval' }),
    card({ title: 'Accessibility audit', column: 'done', status: 'DONE', doneAt: '2026-10-06T10:00:00Z' }),
  ]

  it('shows the Backlog first, then each column as a group, with Done folded', () => {
    view({ cards, backlog: [card({ title: 'Docs site dark mode' })] })
    const groups = screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))
    expect(groups).toEqual(['Backlog', 'To do', 'In progress', 'Done'])
    expect(screen.getByText('Docs site dark mode')).toBeTruthy()
    expect(screen.getByText('Fix the checkout redirect')).toBeTruthy()
    expect(screen.queryByText('Accessibility audit')).toBeNull()
    choose('Done', 'Show done tasks')
    expect(screen.getByText('Accessibility audit')).toBeTruthy()
  })

  it('shows a card with its key, title, agent and state, and opens the task from it', () => {
    const props = view({ cards })
    expect(screen.getByText('Wants approval')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `Open ${cards[1].taskKey}` }))
    expect(props.onOpen).toHaveBeenCalledWith(cards[1])
  })

  it('marks a task that has a conversation, with how many messages the viewer has not read', () => {
    view({ cards: [
      card({ title: 'Talked about', column: 'todo', threadUnread: 2 }),
      card({ title: 'Read all', column: 'todo', threadUnread: 0 }),
      card({ title: 'Never talked about', column: 'todo' }),
    ] })
    const marks = screen.getAllByTestId('thread-mark')
    expect(marks.map(m => m.getAttribute('aria-label'))).toEqual(['Conversation, 2 unread', 'Conversation'])
    expect(marks[0].textContent).toBe('2')
  })

  it('shows "starts work" beside a column that starts it, and switches it from the column\'s own menu @SC-560', () => {
    const onToggleStarts = vi.fn()
    view({ cards, onToggleStarts })
    const todo = screen.getByRole('region', { name: 'To do' })
    expect(within(todo).getByText('starts work')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'In progress' })).queryByText('starts work')).toBeNull()
    fireEvent.click(within(todo).getByRole('button', { name: 'To do column menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop starting work here' }))
    expect(onToggleStarts).toHaveBeenCalledWith('todo')
  })

  it('offers no "starts work" where work cannot be switched (Project Tasks) @SC-560', () => {
    view({ cards })
    expect(screen.queryByRole('button', { name: 'To do column menu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'In progress column menu' })).toBeNull()
  })

  it('shows other boards\' backlogs under their own headings when chosen, and only then @SC-545', () => {
    const own = card({ title: 'Docs site dark mode' })
    const bug = card({ title: 'Footer links 404 on /de', boardId: 'bugs' })
    const { menuFor } = { menuFor: vi.fn(() => []) }
    view({ backlog: [own], showAlso: [{ boardId: 'bugs', boardName: 'Bugs', tasks: [bug] }], menuFor })
    const group = screen.getByRole('group', { name: 'From Bugs' })
    expect(within(group).getByText('Footer links 404 on /de')).toBeTruthy()
    expect(within(group).getByText('In Bugs')).toBeTruthy()
    expect(screen.getByText('Docs site dark mode')).toBeTruthy()
    expect(menuFor).toHaveBeenCalledWith(bug, expect.objectContaining({ boardId: 'bugs' }))
  })

  it('chooses other boards\' backlogs from the Backlog\'s own menu', () => {
    const onChange = vi.fn()
    view({ showAlsoPicker: { boardName: 'Product', options: [{ boardId: 'b2', name: 'Bugs', backlogCount: 5 }], chosen: [], onChange } })
    choose('Backlog', 'Show also…')
    fireEvent.click(screen.getByRole('checkbox', { name: /Bugs/ }))
    expect(onChange).toHaveBeenCalledWith(['b2'])
  })

  it('shows no other board\'s backlog by default', () => {
    view({ backlog: [card({ title: 'Own task' })] })
    expect(screen.queryByRole('group')).toBeNull()
  })
})

describe('chips, on a phone @SC-559', () => {
  it('shows column chips along the top and one column at a time', () => {
    const cards = [card({ title: 'In the doing column', column: 'doing' }), card({ title: 'In the to do column', column: 'todo' })]
    view({ layout: 'chips', cards })
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Backlog 0', 'To do 1', 'In progress 1', 'Done 0'])
    expect(screen.getByText('In the doing column')).toBeTruthy()
    expect(screen.queryByText('In the to do column')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'To do 1' }))
    expect(screen.getByText('In the to do column')).toBeTruthy()
    expect(screen.queryByText('In the doing column')).toBeNull()
  })
})

describe('columns side by side, with room @SC-559', () => {
  it('shows every column at once', () => {
    view({ layout: 'columns', cards: [card({ title: 'A', column: 'todo' }), card({ title: 'B', column: 'doing' })], backlog: [card({ title: 'C' })] })
    for (const t of ['A', 'B', 'C']) expect(screen.getByText(t)).toBeTruthy()
    expect(screen.getAllByRole('region').length).toBe(4)
  })
})

describe('what a card says about its task @SC-559', () => {
  it('names a task in the Backlog as not started, a running one with how long, and a done one by its day', () => {
    expect(cardStateText(card(), NOW).text).toBe('Not started')
    expect(cardStateText(card({ column: 'doing', runState: 'RUN_ACTIVE', lastWorkedAt: '2026-10-08T11:48:00Z' }), NOW).text).toBe('Running · 12 min')
    expect(cardStateText(card({ column: 'done', status: 'DONE', doneAt: '2026-10-06T10:00:00Z' }), NOW).text).toBe('Done Tue')
  })

  it('names a task with no agent to start it', () => {
    expect(cardStateText(card({ column: 'todo', needsYou: true, runState: 'RUN_QUEUED' }), NOW)).toEqual({ text: "Couldn't start — no agent", tone: 'needs' })
  })
})

describe('menus @SC-560', () => {
  const ctx = {
    boardId: 'b1', columns: COLUMNS, otherBoards: [{ id: 'pt', name: 'Project Tasks' }], canChange: true,
    moveToColumn: vi.fn(async () => {}), moveToBoard: vi.fn(async () => {}),
  }

  it('lets a card move to another column, the Backlog or another board, landing in that board\'s Backlog', () => {
    const t = card({ column: 'todo' })
    const items = cardMenuItems(t, null, ctx)
    expect(items.map(i => i.label)).toEqual(['Move to Backlog', 'Move to In progress', 'Move to Done', 'Move to board: Project Tasks'])
    void items[3].onSelect()
    expect(ctx.moveToBoard).toHaveBeenCalledWith(t, 'pt')
  })

  it('lets a task from another board\'s backlog be moved here, and offers a viewer nothing @SC-545', () => {
    const t = card({ boardId: 'bugs' })
    const items = cardMenuItems(t, { boardId: 'bugs', boardName: 'Bugs', tasks: [t] }, ctx)
    expect(items.map(i => i.label)).toEqual(['Move here'])
    expect(cardMenuItems(t, null, { ...ctx, canChange: false })).toEqual([])
  })

  const board = { archived: false, canChange: true, onEditColumns: vi.fn(), onArchive: vi.fn(), onUnarchive: vi.fn(), onDelete: vi.fn() }

  it('has Edit columns, Archive and Delete under a workflow board\'s ⋯', () => {
    expect(boardMenuItems({ ...board, kind: 'WORKFLOW' }).map(i => i.label)).toEqual(['Edit columns', 'Archive', 'Delete'])
    expect(boardMenuItems({ ...board, kind: 'SPRINTS' }).map(i => i.label)).toEqual(['Edit columns', 'Archive', 'Delete'])
  })

  it('has no Archive, Delete or Edit columns on Project Tasks, nor for a viewer', () => {
    expect(boardMenuItems({ ...board, kind: 'PROJECT_TASKS' })).toEqual([])
    expect(boardMenuItems({ ...board, kind: 'WORKFLOW', canChange: false })).toEqual([])
  })

  it('has Unarchive and Delete, but no editing, on an archived board', () => {
    expect(boardMenuItems({ ...board, kind: 'WORKFLOW', archived: true }).map(i => i.label)).toEqual(['Unarchive', 'Delete'])
  })
})

describe('where the tool is, in the address @SC-563', () => {
  it('reads the list, archived, new, a board, its timeline and finish screens, a task and its session', () => {
    const at = (q: string) => screenOf(new URLSearchParams(q))
    expect(at('tool=boards')).toEqual({ kind: 'list' })
    expect(at('bview=archived')).toEqual({ kind: 'archived' })
    expect(at('bview=new')).toEqual({ kind: 'new' })
    expect(at('board=b1')).toEqual({ kind: 'board', boardId: 'b1', mode: 'columns', sprintId: null })
    expect(at('board=b1&bview=timeline')).toMatchObject({ mode: 'timeline' })
    expect(at('board=b1&bview=finish')).toMatchObject({ mode: 'finish' })
    expect(at('board=b1&bsprint=s11')).toMatchObject({ sprintId: 's11' })
    expect(at('board=b1&btask=WEB-27&bat=waiting')).toEqual({ kind: 'task', boardId: 'b1', taskKey: 'WEB-27', atWaiting: true })
    expect(at('board=b1&btask=WEB-27&bview=session')).toEqual({ kind: 'session', boardId: 'b1', taskKey: 'WEB-27' })
  })

  it('does not read the Tasks tool\'s own parameters', () => {
    expect(screenOf(new URLSearchParams('tool=boards&task=WEB-27&view=backlog'))).toEqual({ kind: 'list' })
  })
})

describe('folding the Backlog @SC-562', () => {
  const backlog = [card({ title: 'Docs site dark mode' }), card({ title: 'Rename the settings page' })]

  beforeEach(() => window.localStorage.clear())
  afterEach(() => cleanup())

  it('stacked: Hide folds the Backlog like Done, Show brings it back, and the choice is kept for this board', () => {
    view({ backlog })
    choose('Backlog', 'Hide the Backlog')
    expect(screen.queryByText('Docs site dark mode')).toBeNull()
    expect(window.localStorage.getItem('board-backlog-folded:b1')).toBe('1')
    cleanup()
    view({ backlog })
    expect(screen.queryByText('Docs site dark mode')).toBeNull()
    choose('Backlog', 'Show the Backlog')
    expect(screen.getByText('Docs site dark mode')).toBeTruthy()
    expect(window.localStorage.getItem('board-backlog-folded:b1')).toBe('0')
  })

  it('remembers the choice per board', () => {
    view({ backlog })
    choose('Backlog', 'Hide the Backlog')
    cleanup()
    view({ backlog, boardId: 'b2' })
    expect(screen.getByText('Docs site dark mode')).toBeTruthy()
  })

  it('side by side: folds to a slim strip with its count, and the strip opens it again', () => {
    view({ layout: 'columns', backlog })
    choose('Backlog', 'Hide the Backlog')
    expect(screen.queryByText('Docs site dark mode')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Backlog' })).toBeNull()
    const strip = screen.getByRole('button', { name: 'Show the Backlog, 2 tasks' })
    expect(strip.textContent).toContain('Backlog')
    expect(strip.textContent).toContain('2')
    fireEvent.click(strip)
    expect(screen.getByText('Docs site dark mode')).toBeTruthy()
  })

  it('phone: folds the Backlog chip\'s list', () => {
    view({ layout: 'chips', backlog })
    fireEvent.click(screen.getByRole('tab', { name: /Backlog/ }))
    expect(screen.getByText('Docs site dark mode')).toBeTruthy()
    choose('Backlog', 'Hide the Backlog')
    expect(screen.queryByText('Docs site dark mode')).toBeNull()
  })

  it('works without storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    view({ backlog })
    choose('Backlog', 'Hide the Backlog')
    expect(screen.queryByText('Docs site dark mode')).toBeNull()
    get.mockRestore()
    set.mockRestore()
  })
})

describe('cards and rows', () => {
  afterEach(() => cleanup())

  it('answer the pointer: a highlighted edge, and the key and title run on together', () => {
    view({ layout: 'stacked', backlog: [card({ id: 'c1', taskKey: 'WEB-4', title: 'A fairly long title that wraps' })] })
    const open = screen.getByRole('button', { name: 'Open WEB-4' })
    expect(open.className).toContain('cursor-pointer')
    expect(open.parentElement!.className).toContain('hover:ring-accent')
    const line = within(open).getByText('WEB-4').parentElement!
    expect(line.textContent).toContain('A fairly long title that wraps')
  })

  it('mark an epic', () => {
    view({ layout: 'stacked', backlog: [card({ title: 'Pricing page', isEpic: true })] })
    expect(screen.getByText('Epic')).toBeTruthy()
  })
})
