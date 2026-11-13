// @vitest-environment jsdom
/** The task page's tabs (T0): Comments threaded one level, Runs as a timeline by stored number, Activity. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

import { CommentsSection, TaskTabs, TaskRunsTimeline, TaskActivityList, activityLines } from '@agenthix/ui/tasks'

afterEach(cleanup)

const at = (m: number) => new Date(2026, 10, 6, 9, m).toISOString()
const comment = (id: string, m: number, content: string, parentId: string | null = null) =>
  ({ id, content, createdAt: at(m), authorType: 'USER', userName: 'Sam Okafor', parentId })

describe('the tabs @SC-515', () => {
  it('are Activity, Comments and Runs with their counts, Activity open first', () => {
    render(<TaskTabs session={null} comments={<p>the comments</p>} runs={<p>the runs</p>} activity={<p>the log</p>} commentCount={3} runCount={2} />)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Activity', 'Comments3', 'Runs2'])
    expect(screen.getByText('the log')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Runs/ }))
    expect(screen.getByText('the runs')).toBeTruthy()
  })

  it('have Files last, with its count, when the task has a folder', () => {
    render(<TaskTabs session={null} comments={<p>c</p>} runs={<p>r</p>} activity={<p>a</p>} files={<p>the files</p>} fileCount={1} />)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Activity', 'Comments', 'Runs', 'Files1'])
    fireEvent.click(screen.getByRole('tab', { name: /Files/ }))
    expect(screen.getByText('the files')).toBeTruthy()
  })

  it("are Tasks, Comments and Activity on an epic's page, with no Runs", () => {
    render(<TaskTabs session={null} comments={<p>c</p>} activity={<p>a</p>} tasks={{ count: 5, content: <p>the tasks</p> }} />)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Tasks5', 'Comments', 'Activity'])
    expect(screen.getByText('the tasks')).toBeTruthy()
  })

  it('open the tab the caller keeps, and tell it of a change', () => {
    const onTabChange = vi.fn()
    render(<TaskTabs session={null} comments={<p>c</p>} runs={<p>the runs</p>} activity={<p>a</p>} tab="runs" onTabChange={onTabChange} />)
    expect(screen.getByText('the runs')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(onTabChange).toHaveBeenCalledWith('activity')
  })
})

describe('the comments, threaded one level @SC-515', () => {
  function draw(onReply = vi.fn().mockResolvedValue(undefined)) {
    const comments = [comment('a', 1, 'Keep it short.'), comment('a1', 2, 'Agreed.', 'a'), comment('a1x', 3, 'Yes.', 'a1'), comment('b', 4, 'Saved bit.')]
    render(
      <CommentsSection
        heading={false} comments={comments} commentDraft="" setCommentDraft={vi.fn()} commentBusy={false}
        onAddComment={vi.fn()} onReply={onReply} renderMarkdown={t => <p>{t}</p>} hint="For the task's record"
      />,
    )
    return onReply
  }

  it('puts a reply to a reply under the top comment of its thread', () => {
    draw()
    const threads = screen.getAllByTestId('comment-thread')
    expect(threads).toHaveLength(2)
    const replies = within(threads[0]).getByTestId('comment-replies')
    expect(within(replies).getByText('Agreed.')).toBeTruthy()
    expect(within(replies).getByText('Yes.')).toBeTruthy()
  })

  it("writes a reply to a reply under the thread's top comment", async () => {
    const onReply = draw()
    const yes = screen.getByText('Yes.').closest('[data-testid="task-comment"]') as HTMLElement
    fireEvent.click(within(yes).getByRole('button', { name: 'Reply' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'Done.' } })
    fireEvent.click(within(screen.getAllByTestId('comment-replies')[0]).getAllByRole('button', { name: 'Reply' }).at(-1)!)
    await waitFor(() => expect(onReply).toHaveBeenCalledWith('a', 'Done.'))
  })

  it('writes in Markdown with Write and Preview, and says what a comment is for behind the ? beside Markdown', () => {
    draw()
    expect(screen.getByRole('tab', { name: 'Write' })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy()
    expect(screen.getByRole('button', { name: "For the task's record" })).toBeTruthy()
    expect(screen.queryByText("For the task's record")).toBeNull()
  })

  it('marks a comment saved from the conversation', () => {
    render(<CommentsSection comments={[{ ...comment('s', 1, 'No prices.'), savedFromConversation: true }]} commentDraft="" setCommentDraft={vi.fn()} commentBusy={false} />)
    expect(screen.getByText('Saved from the conversation')).toBeTruthy()
  })
})

describe('the runs, one timeline @SC-516', () => {
  const run = (id: string, number: number | null, status: string, m: number, end: number | null, extra = {}) =>
    ({ id, number, status, createdAt: at(m), endedAt: end === null ? null : at(end), startedBy: 'started by you', ...extra })
  const runs = [
    run('r1', 4, 'COMPLETED', 1, 2, { result: 'Two footer links are broken.' }),
    run('r2', 5, 'FAILED', 3, 4, { error: 'the model provider was overloaded' }),
    run('r3', 6, 'RUNNING', 10, null),
  ]
  function draw(over: Partial<React.ComponentProps<typeof TaskRunsTimeline>> = {}) {
    const props = {
      agentName: 'Writer', sessionId: 's1', socket: null, entries: [], runs, refetch: vi.fn().mockResolvedValue({ entries: [] }),
      runningRunId: 'r3', now: new Date(2026, 10, 6, 9, 12), onStop: vi.fn(), ...over,
    }
    render(<TaskRunsTimeline {...props} />)
    return props
  }

  it('shows each run on one line by its stored number, newest first', () => {
    draw()
    const lines = screen.getAllByTestId('run-line').map(l => l.textContent ?? '')
    expect(lines.map(l => l.match(/Run \d+/)?.[0])).toEqual(['Run 6', 'Run 5', 'Run 4'])
    expect(lines[1]).toContain('Failed · the model provider was overloaded')
    expect(lines[2]).toContain('Two footer links are broken.')
  })

  it('has the live run open, with Stop, and nothing to type into it', () => {
    const props = draw()
    const live = screen.getAllByTestId('run-line')[0]
    expect(within(live).getByRole('button', { expanded: true })).toBeTruthy()
    expect(within(live).getByText(/Works on its own until it finishes/)).toBeTruthy()
    fireEvent.click(within(live).getByRole('button', { name: /Stop/ }))
    expect(props.onStop).toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('opens the run the address names', () => {
    draw({ openRunId: 'r1' })
    expect(within(screen.getAllByTestId('run-line')[2]).getByRole('button', { expanded: true })).toBeTruthy()
  })
})

describe('the activity @SC-515', () => {
  it('opens a run line in Runs and a comment line in Comments', () => {
    const onOpen = vi.fn()
    const rows = [
      { id: '1', kind: 'COMMENTED', by: 'person' as const, name: 'You', runId: null, detail: { commentId: 'c1', parentId: null }, createdAt: at(5) },
      { id: '2', kind: 'RUN_STARTED', by: 'person' as const, name: 'You', runId: 'r2', detail: { number: 2 }, createdAt: at(4) },
    ]
    render(<TaskActivityList lines={activityLines(rows)} onOpen={onOpen} now={new Date(2026, 10, 6, 10)} />)
    expect(screen.getAllByTestId('activity-line').map(l => l.textContent)).toEqual(['You commented · See in Comments09:05', 'Run 2 started by you · See in Runs09:04'])
    fireEvent.click(screen.getByRole('button', { name: 'See in Runs' }))
    expect(onOpen).toHaveBeenCalledWith({ tab: 'runs', runId: 'r2' })
  })
})
