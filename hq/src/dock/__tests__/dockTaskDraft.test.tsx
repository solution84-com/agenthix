// @vitest-environment jsdom
/**
 * *Talk about this task* before the task has a conversation: the draft is about the task, its agent leading, with
 * no place list and no agent or model pickers; its first message creates the task's conversation, which the panel
 * then shows.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../DockContext', () => ({ useDock: () => ({ openConversation: h.open }) }))
vi.mock('../../projects/components/TaskThreadSection', () => ({
  TaskFirstMessage: ({ taskId, agentName, onStarted }: { taskId: string; agentName: string | null; onStarted?: (id: string) => void }) => (
    <button type="button" onClick={() => onStarted?.('c-task')}>first message for {taskId} to {agentName}</button>
  ),
}))
vi.mock('../../conversations/components/NewConversationBox', () => ({ NewConversationBox: () => <div data-testid="new-box" /> }))
vi.mock('../DockPlaceList', () => ({ DockPlaceList: () => <div data-testid="place-list" /> }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: [] }), getPins: 'getPins', getProjects: 'getProjects', getProjectByKey: 'getProjectByKey' }))

import { DockNewConversation } from '../DockNewConversation'

afterEach(cleanup)

describe('a draft about a task', () => {
  const task = { taskId: 't1', taskKey: 'WEB-2', agentName: 'Writer' }

  it('says what it is about and who leads it, with no place list and no ordinary box', () => {
    render(<DockNewConversation here={{ kind: 'project', key: 'WEB' }} agentId={null} task={task} />)
    expect(screen.getByTestId('dock-task-conversation').textContent).toContain('About WEB-2. Writer leads it.')
    expect(screen.queryByTestId('place-list')).toBeNull()
    expect(screen.queryByTestId('new-box')).toBeNull()
  })

  it('shows the new conversation in the panel once its first message has created it', () => {
    render(<DockNewConversation here={{ kind: 'project', key: 'WEB' }} agentId={null} task={task} />)
    fireEvent.click(screen.getByRole('button', { name: 'first message for t1 to Writer' }))
    expect(h.open).toHaveBeenCalledWith('c-task', null)
  })

  it('is the ordinary draft when it is not about a task', () => {
    render(<DockNewConversation here={{ kind: 'space' }} agentId={null} />)
    expect(screen.queryByTestId('dock-task-conversation')).toBeNull()
  })
})
