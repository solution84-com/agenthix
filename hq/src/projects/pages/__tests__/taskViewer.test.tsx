// @vitest-environment jsdom
/** A project Viewer on a task's page: who can okay a waiting run, and the comment box and Reply greyed with why. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

import { CommentsSection, TaskRunsTimeline } from '@agenthix/ui/tasks'
import { VIEWER_CANNOT_WORK } from '../../../shared/hooks/useMayWork'
import { VIEWER_WAITING_LINE } from '../useTaskRuns'

afterEach(cleanup)

const at = (m: number) => new Date(2026, 10, 6, 9, m).toISOString()

describe("a Viewer on a task's Runs tab", () => {
  const runs = [{ id: 'r1', number: 2, status: 'RUNNING', createdAt: at(1), endedAt: null, startedBy: 'started by you' }]
  const draw = (waitingLine?: string) => render(
    <TaskRunsTimeline
      agentName="Writer" sessionId="s1" socket={null} entries={[]} runs={runs} refetch={vi.fn().mockResolvedValue({ entries: [] })}
      waitingRunId="r1" waitingLine={waitingLine} now={new Date(2026, 10, 6, 9, 12)}
    />,
  )

  it('is not told the waiting run waits for their okay: the line says who can give it', () => {
    draw(VIEWER_WAITING_LINE)
    const line = screen.getByTestId('run-line').textContent ?? ''
    expect(line).toContain('Waiting for a Member or Admin of this project to okay it')
    expect(line).not.toContain('Waiting for your okay')
  })

  it('still reads "Waiting for your okay" to someone who can answer', () => {
    draw()
    expect(screen.getByTestId('run-line').textContent).toContain('Waiting for your okay')
  })
})

describe("a Viewer on a task's Comments tab", () => {
  const comments = [{ id: 'a', content: 'Keep it short.', createdAt: at(1), authorType: 'USER', userName: 'Sam Okafor' }]

  it('sees the comment box and Reply greyed, with why on each', () => {
    render(
      <CommentsSection
        heading={false} comments={comments} commentDraft="" setCommentDraft={vi.fn()} commentBusy={false}
        cannotCommentReason={VIEWER_CANNOT_WORK} renderMarkdown={t => <p>{t}</p>}
      />,
    )
    const box = screen.getByRole('textbox', { name: 'Add a comment' }) as HTMLTextAreaElement
    expect(box.disabled).toBe(true)
    const comment = screen.getByRole('button', { name: 'Comment' }) as HTMLButtonElement
    expect(comment.disabled).toBe(true)
    expect(comment.title).toBe(VIEWER_CANNOT_WORK)
    expect(box.closest('[title]')?.getAttribute('title')).toBe(VIEWER_CANNOT_WORK)
    const reply = screen.getByRole('button', { name: 'Reply' }) as HTMLButtonElement
    expect(reply.disabled).toBe(true)
    expect(reply.closest('[title]')?.getAttribute('title')).toBe(VIEWER_CANNOT_WORK)
  })

  it('shows no box at all where no reason is given and no comment may be added', () => {
    render(<CommentsSection heading={false} comments={comments} commentDraft="" setCommentDraft={vi.fn()} commentBusy={false} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  })
})
