// @vitest-environment jsdom
/** A task's runs draw each run's steps with the conversation's pieces; what the person may do to them is what they are passed. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

import { TaskSessionView } from '@agenthix/ui/tasks'
import { reply, system, tool, user } from '../../../shared/components/ChatPanel/__tests__/conversationFixtures'

afterEach(cleanup)

const runs = [{ id: 'r1', status: 'FAILED', number: 1, createdAt: new Date(2026, 9, 10, 10, 20).toISOString(), endedAt: new Date(2026, 9, 10, 10, 31).toISOString() }]
const waitingCard = { answer: 'waiting', allowedFor: 'this_run', decidedBy: null, decidedByYou: false, decidedAt: null, reason: null, items: [{ does: 'Fetch a web page', why: null, command: false }] }

function view(entries: unknown[], over: Partial<React.ComponentProps<typeof TaskSessionView>> = {}) {
  const props = {
    summary: 'WEB-27 · Frontend dev · 1 run', agentName: 'Frontend dev', sessionId: 's1', socket: null, entries: entries as never, runs,
    refetch: vi.fn().mockResolvedValue({ entries }), openRunId: 'r1', ...over,
  }
  render(<TaskSessionView {...props} />)
  return props
}

describe('a task run as a conversation @SC-516 @SC-700', () => {
  it('heads each reply with who wrote it and when, folds the work, and keeps Copy, Usage and Details under it', () => {
    const onOpenRun = vi.fn()
    view(
      [user('Use staging.', 24, { runId: 'r1' }), tool('Read', { file_path: '/a.ts' }, 25, { runId: 'r1' }), reply('Done.', 26, { runId: 'r1' })],
      { links: { onOpenRun, canOpenTarget: () => false } },
    )
    expect(screen.getByText('Frontend dev', { selector: 'span.font-medium' })).toBeTruthy()
    expect(screen.getByText(/Read 1 file/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(onOpenRun).toHaveBeenCalledWith('r1')
  })

  it('folds the run to one line and opens it to its steps', () => {
    view([user('Use staging.', 24, { runId: 'r1' }), reply('Done.', 26, { runId: 'r1' })], { openRunId: null })
    expect(screen.getByTestId('run-line').textContent).toContain('Run 1')
    expect(screen.queryByText('Done.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Done.')).toBeTruthy()
  })

  it('offers Approve and Deny only when the person may answer', () => {
    const entries = [user('Update.', 44, { runId: 'r1' }), system('APPROVAL_REQUESTED', 45, { runId: 'r1', approvalCard: waitingCard })]
    view(entries)
    expect(screen.queryByText('Approve')).toBeNull()
    cleanup()
    const approve = vi.fn().mockResolvedValue(undefined)
    view(entries, { recordActions: { approvalActions: { approveManifest: approve, rejectManifest: vi.fn() } } })
    fireEvent.click(screen.getByText('Approve'))
    expect(approve).toHaveBeenCalledWith({ runId: 'r1', sessionId: 's1' })
  })

  it('shows the latest failure with its reason, and Try again only when offered @SC-694', () => {
    const entries = [user('Summarise.', 30, { runId: 'r1' }), system('RUN_FAILED', 31, { runId: 'r1', detail: { reason: 'The site lost its connection to the model.' } })]
    view(entries, { latestFailureRunId: 'r1' })
    expect(screen.getByText('The site lost its connection to the model.')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
    cleanup()
    const onTryAgain = vi.fn()
    view(entries, { latestFailureRunId: 'r1', recordActions: { onTryAgain } })
    fireEvent.click(screen.getByText('Try again'))
    expect(onTryAgain).toHaveBeenCalled()
  })
})
