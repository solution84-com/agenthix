import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelActivityList } from '../PanelActivityList'
import type { TaskSession } from '../types'

const session = (over: Partial<TaskSession> = {}): TaskSession => ({
  id: 's1', updatedAt: new Date().toISOString(), status: 'ACTIVE', sessionType: 'task',
  agent: { id: 'a1', name: 'Kira', handle: 'kira', avatarUrl: null },
  task: { id: 't1', title: 'Fix the login page', runState: 'done', number: 7, project: { key: 'NP' } },
  AgentRun: [{ id: 'r1', status: 'COMPLETED', startedAt: null, endedAt: null }],
  ...over,
})

function list(sessions: TaskSession[]) {
  const onOpenChat = vi.fn()
  const actions = { stopTaskSession: vi.fn(), stopAllSessions: vi.fn(), deleteTaskSession: vi.fn() }
  render(<PanelActivityList taskId="t1" socket={null} queries={{ getTaskSessions: async () => sessions }} actions={actions} onOpenChat={onOpenChat} />)
  return { onOpenChat, actions }
}

afterEach(cleanup)

describe('a session row in the activity list @SC-1908', () => {
  it('is a tab stop, and Enter or Space on it opens the session', async () => {
    const { onOpenChat } = list([session()])
    const row = await screen.findByRole('button', { name: "Open Kira's session: Fix the login page" })
    expect(row.tabIndex).toBe(0)
    row.focus()
    expect(document.activeElement).toBe(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpenChat).toHaveBeenCalledWith('s1')
    fireEvent.keyDown(row, { key: ' ' })
    expect(onOpenChat).toHaveBeenCalledTimes(2)
  })

  it("leaves Enter on its own buttons to them", async () => {
    const { onOpenChat } = list([session()])
    fireEvent.keyDown(await screen.findByTitle('Delete session'), { key: 'Enter' })
    expect(onOpenChat).not.toHaveBeenCalled()
  })
})
