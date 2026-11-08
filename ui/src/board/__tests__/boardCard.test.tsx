import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BoardCardView } from '../BoardCardView'
import { cardStateText } from '../cardState'
import type { BoardCardData } from '../types'

const card: BoardCardData = {
  id: 't1', taskKey: 'AB-1', title: 'Write', priority: 'LOW', status: 'TODO', column: 'todo', boardId: 'b1',
  runState: 'RUN_NONE', runStateReason: null, assignedAgent: null, needsYou: false, routineId: 'r1',
}

describe('a card on a board', () => {
  it('keeps a routine link out of the open button, so clicking it does not open the task', () => {
    const onOpen = vi.fn()
    render(
      <BoardCardView
        card={card} variant="card" now={new Date()} onOpen={onOpen} menu={[]}
        linkRoutine={(id, children) => <a href={`/r/${id}`}>{children}</a>}
      />,
    )
    const link = screen.getByRole('link')
    expect(screen.getByRole('button', { name: 'Open AB-1' }).contains(link)).toBe(false)
    fireEvent.click(link)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does not throw on a date that does not parse', () => {
    const bad = { ...card, status: 'DONE', doneAt: 'not a date', updatedAt: 'nope', lastWorkedAt: 'nope', scheduleNextDueAt: 'nope', runState: 'RUN_ACTIVE' }
    expect(() => cardStateText(bad, new Date())).not.toThrow()
    expect(cardStateText(bad, new Date()).text).toBe('Done')
  })
})

describe('the agent on a card (D18)', () => {
  it('shows the run as the ring on the agent’s avatar, with the words on hover', () => {
    const agent = { id: 'a1', name: 'Writer' }
    render(<BoardCardView card={{ ...card, assignedAgent: agent, executionState: 'RUNNING' }} variant="card" now={new Date()} onOpen={() => {}} menu={[]} />)
    const avatar = screen.getByRole('img', { name: 'Writer · Running' })
    expect(avatar.getAttribute('data-run')).toBe('RUNNING')
    expect(avatar.querySelector('[data-testid="run-ring"]')).not.toBeNull()
  })

  it('draws no ring when nothing is running for it', () => {
    render(<BoardCardView card={{ ...card, assignedAgent: { id: 'a1', name: 'Writer' }, executionState: 'FINISHED' }} variant="card" now={new Date()} onOpen={() => {}} menu={[]} />)
    expect(screen.getByRole('img', { name: 'Writer · Finished' }).querySelector('[data-testid="run-ring"]')).toBeNull()
  })
})
