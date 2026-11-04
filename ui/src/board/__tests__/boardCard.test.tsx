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
