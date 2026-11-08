import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ViewCard } from '../ViewCard'
import { SavedBoardsList } from '../SavedBoardsList'
import { BoardToolbar, ViewChangedControls } from '../BoardToolbar'
import { PhoneColumns } from '../PhoneColumns'
import { spreadTone, spreadWords } from '../SpreadBar'
import { movedWords, needsYouWords } from '../boardWords'
import { dropNeighbours, dropPlaceOf, ordinal } from '../dropPlace'
import type { BoardRowData, ViewCardData, ViewColumnData } from '../types'

const card = (over: Partial<ViewCardData> = {}): ViewCardData => ({
  id: 't14', key: 'WEB-14', title: 'Fix the contact form', priority: 'HIGH',
  type: { id: 'bug', name: 'Bug', icon: 'bug', kind: 'CUSTOM' }, state: 'IN_PROGRESS', executionState: 'NOT_STARTED',
  agent: null, ...over,
})

describe('a board card, layout C', () => {
  it('is the key line and the title, with no bottom row when no one is assigned', () => {
    render(<ViewCard card={card()} showType={false} onOpen={() => {}} menu={[{ label: 'Open', onSelect: () => {} }]} />)
    const c = screen.getByTestId('board-card')
    expect(c.textContent).toContain('WEB-14')
    expect(c.textContent).toContain('Fix the contact form')
    expect(within(c).queryByRole('img', { name: /Writer/ })).toBeNull()
    expect(within(c).queryByRole('img', { name: 'Bug' })).toBeNull()
    // No buttons on a card but its open and its ⋯.
    expect(within(c).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Open WEB-14: Fix the contact form', 'Actions for WEB-14'])
  })

  it('shows its type before the key on a board that mixes types, and its assignee with the run as the ring', () => {
    render(<ViewCard card={card({ agent: { id: 'w', name: 'Writer' }, executionState: 'RUNNING' })} showType onOpen={() => {}} menu={[]} />)
    const c = screen.getByTestId('board-card')
    expect(within(c).getByRole('img', { name: 'Bug' })).toBeTruthy()
    expect(within(c).getByRole('img', { name: 'Writer · Running' })).toBeTruthy()
    expect(c.querySelector('[data-testid="run-ring"]')).not.toBeNull()
  })

  it('opens the task from its title', () => {
    const onOpen = vi.fn()
    render(<ViewCard card={card()} showType={false} onOpen={onOpen} menu={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open WEB-14/ }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('shows an epic\'s progress', () => {
    render(<ViewCard card={card({ type: { id: 'e', name: 'Epic', icon: 'epic', kind: 'EPIC' }, epicProgress: { done: 3, total: 6 } })} showType onOpen={() => {}} menu={[]} />)
    expect(screen.getByTestId('board-card').textContent).toContain('3 / 6')
  })
})

describe('where a dragged card lands', () => {
  const columns: ViewColumnData[] = [
    { key: 'reported', name: 'Reported', state: 'BACKLOG', count: 2, cards: [card({ id: 'a' }), card({ id: 'b' })] },
    { key: 'triaged', name: 'Triaged', state: 'TODO', count: 2, cards: [card({ id: 'c' }), card({ id: 'd' })] },
    { key: 'fixing', name: 'Fixing', state: 'IN_PROGRESS', count: 0, cards: [] },
  ]

  it('goes before the card it is over, or after it past that card\'s middle', () => {
    expect(dropPlaceOf(columns, 'a', { column: 'triaged', overCard: 'd', below: false })).toEqual({ column: 'triaged', index: 1 })
    expect(dropPlaceOf(columns, 'a', { column: 'triaged', overCard: 'd', below: true })).toEqual({ column: 'triaged', index: 2 })
    expect(dropPlaceOf(columns, 'a', { column: 'fixing', overCard: null, below: false })).toEqual({ column: 'fixing', index: 0 })
  })

  it('names the visible card above, or at the top the one below, and nothing when it would stay put', () => {
    expect(dropNeighbours(columns, 'a', { column: 'triaged', index: 1 })).toEqual({ afterTaskId: 'c', beforeTaskId: null })
    expect(dropNeighbours(columns, 'a', { column: 'triaged', index: 0 })).toEqual({ afterTaskId: null, beforeTaskId: 'c' })
    expect(dropNeighbours(columns, 'a', { column: 'fixing', index: 0 })).toEqual({ afterTaskId: null, beforeTaskId: null })
    expect(dropNeighbours(columns, 'b', { column: 'reported', index: 1 })).toBeNull()
    expect(dropNeighbours(columns, 'b', { column: 'reported', index: 0 })).toEqual({ afterTaskId: null, beforeTaskId: 'a' })
  })

  it('says its place in words', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
  })
})

describe('a board\'s spread and when it last moved', () => {
  const spread = [
    { key: 'BACKLOG', name: 'Backlog', count: 9, state: 'BACKLOG' as const },
    { key: 'DONE', name: 'Done', count: 11, state: 'DONE' as const },
  ]
  it('writes the counts in the board\'s order, and colours each part by what it is', () => {
    expect(spreadWords(spread)).toBe('Backlog 9 · Done 11')
    expect(spreadTone('STATE', spread[1]!, 1, 2)).toBe('bg-success')
    expect(spreadTone('EXECUTION', { key: 'FAILED', name: 'Failed', count: 1, state: null }, 4, 6)).toBe('bg-danger')
    expect(spreadTone('FIELD', { key: 'none', name: 'No value', count: 1, state: null }, 0, 5)).toBe('bg-surface-3')
    expect(spreadTone('FIELD', { key: 'live', name: 'Live', count: 1, state: null }, 4, 5)).toBe('bg-accent')
  })
  it('says when a card last moved, and how many need you', () => {
    const now = new Date('2026-11-07T12:00:00Z')
    expect(movedWords(null, now)).toBeNull()
    expect(movedWords(new Date('2026-11-07T11:50:00Z'), now)).toBe('moved 10 min ago')
    expect(movedWords(new Date('2026-11-07T10:00:00Z'), now)).toBe('moved 2 h ago')
    expect(movedWords(new Date('2026-11-06T10:00:00Z'), now)).toBe('moved yesterday')
    expect(needsYouWords(1)).toBe('1 needs you')
    expect(needsYouWords(3)).toBe('3 need you')
  })
})

describe('the saved boards list', () => {
  const row = (over: Partial<BoardRowData>): BoardRowData => ({
    key: 'state', name: 'Task state', builtIn: true, kind: 'STATE', what: 'every type, by task state',
    spread: [], needsYouCount: 0, lastMovedAt: null, ...over,
  })
  it('puts the built-in boards first, and says so when none is saved', () => {
    render(<SavedBoardsList boards={[row({}), row({ key: 'execution', name: 'Execution', kind: 'EXECUTION' })]} now={new Date()} onOpen={() => {}} menuFor={() => []} />)
    expect(within(screen.getByRole('region', { name: 'Built in' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Saved' }).textContent).toContain('No saved boards yet.')
    expect(screen.getByText('Read-only')).toBeTruthy()
  })
  it('lists a saved board with what needs you', () => {
    render(<SavedBoardsList boards={[row({}), row({ key: 'b1', name: 'Bugs', builtIn: false, kind: 'TYPE', what: "Bug's columns", needsYouCount: 1 })]} now={new Date()} onOpen={() => {}} menuFor={() => []} />)
    const saved = screen.getByRole('region', { name: 'Saved' })
    expect(saved.textContent).toContain('Bugs')
    expect(saved.textContent).toContain('1 needs you')
  })
})

describe('the toolbar', () => {
  it('draws a filter not set as a button, and a set one as a chip that clears', () => {
    const onClear = vi.fn()
    render(
      <BoardToolbar
        columnsLabel="Bug's columns" columns={[]} search="" onSearch={() => {}} end={null}
        filters={[
          { id: 'sprint', label: 'Sprint', value: 'Current sprint', choices: [], onClear },
          { id: 'agent', label: 'Agent', value: null, choices: [], onClear: () => {} },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: /Columns:\sBug's columns/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear Sprint' }))
    expect(onClear).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Clear Agent' })).toBeNull()
  })

  it('greys Save changes with why on a built-in board', () => {
    render(<ViewChangedControls builtIn saveChangesWhy="Task state is built in" onReset={() => {}} onSaveAsNew={() => {}} onSaveChanges={() => {}} />)
    expect(screen.getByText('Changed from the built-in board')).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(save.title).toBe('Task state is built in')
  })
})

describe('a board on a phone', () => {
  it('shows one column at a time under its chips', () => {
    const onColumn = vi.fn()
    const columns: ViewColumnData[] = [
      { key: 'r', name: 'Reported', state: 'BACKLOG', count: 0, cards: [] },
      { key: 't', name: 'Triaged', state: 'TODO', count: 1, cards: [card()] },
    ]
    render(<PhoneColumns columns={columns} current="t" onColumn={onColumn} showType={false} held={null} onOpen={() => {}} onHold={() => {}} emptyWords="No bug here" />)
    expect(screen.getByRole('tab', { name: 'Triaged 1' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: 'Triaged' }).textContent).toContain('WEB-14')
    fireEvent.click(screen.getByRole('tab', { name: 'Reported 0' }))
    expect(onColumn).toHaveBeenCalledWith('r')
  })
})
