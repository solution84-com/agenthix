// @vitest-environment jsdom
/** The Comments tab sends a reply under its thread's top comment, and leaves the run's approval markers out. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ addTaskComment: vi.fn(), comments: [] as unknown[] }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.comments, refetch: vi.fn().mockResolvedValue(undefined) }),
  getTaskComments: 'getTaskComments', addTaskComment: h.addTaskComment,
}))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null, isConnected: false }), useSocketListener: () => undefined }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))
vi.mock('../TaskThreadSection', () => ({ useTalkAboutTask: () => ({ open: vi.fn(), refusal: null }) }))

import { TaskCommentsTab } from '../TaskCommentsTab'

afterEach(() => { cleanup(); h.addTaskComment.mockReset() })

const c = (id: string, content: string, parentId: string | null = null, m = 1) =>
  ({ id, content, parentId, createdAt: new Date(2026, 10, 6, 9, m).toISOString(), authorType: 'USER', userName: 'Sam Okafor', agent: null })

describe('the Comments tab', () => {
  it("replies under the thread's top comment, through addTaskComment", async () => {
    h.comments = [c('a', 'Keep it short.'), c('a1', 'Agreed.', 'a', 2)]
    h.addTaskComment.mockResolvedValue({ id: 'n' })
    render(<TaskCommentsTab taskId="t1" taskKey="WEB-2" canComment />)
    const agreed = screen.getByText('Agreed.').closest('[data-testid="task-comment"]') as HTMLElement
    fireEvent.click(within(agreed).getByRole('button', { name: 'Reply' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'Yes, three lines.' } })
    fireEvent.click(within(screen.getByTestId('comment-replies')).getAllByRole('button', { name: 'Reply' }).at(-1)!)
    await waitFor(() => expect(h.addTaskComment).toHaveBeenCalledWith({ taskId: 't1', content: 'Yes, three lines.', parentId: 'a' }))
  })

  it("leaves out a run's approval marker and offers Talk about this task under the box", () => {
    h.comments = [c('a', 'Keep it short.'), c('m', '__MANIFEST_APPROVAL__:{"runId":"r"}')]
    render(<TaskCommentsTab taskId="t1" taskKey="WEB-2" canComment />)
    expect(screen.getAllByTestId('task-comment')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Talk about this task' })).toBeTruthy()
  })

  it('has no box for someone who may not comment', () => {
    h.comments = [c('a', 'Keep it short.')]
    render(<TaskCommentsTab taskId="t1" taskKey="WEB-2" canComment={false} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  })
})
