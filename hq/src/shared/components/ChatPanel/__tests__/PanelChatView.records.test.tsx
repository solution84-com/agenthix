// @vitest-environment jsdom
/** What a conversation keeps (every screen reviewed): failed and stopped runs, and approvals asked and answered. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'

vi.mock('../../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  navigate: vi.fn(),
  actions: {} as Record<string, ReturnType<typeof vi.fn>>,
  names: ['triggerAgentRun', 'cancelAgentRun', 'updateSession', 'approveManifest', 'rejectManifest', 'tryAgain', 'sendWaitingMessageNow', 'cancelWaitingMessage', 'summariseConversation'],
}))
// A used skill's line is hq's to give (useSessionSkillLines.test.ts); none here.
vi.mock('../useSessionSkillLines', () => ({ useSessionSkillLines: () => () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: vi.fn(),
  useAction: (name: string) => (h.actions[name] ??= vi.fn(async () => ({ id: 'run-new' }))),
  getSession: h.getSession,
  getProject: vi.fn(),
  getSessionPendingManifest: vi.fn(async () => null),
  ...Object.fromEntries(h.names.map(n => [n, n])),
}))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null }) }))
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('../../../utils/agentImageUrl', () => ({ resolveAgentImageUrl: async () => null }))
vi.mock('../../../hooks/useMayWork', () => ({ useMayWork: () => true, useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: 'no' }))
vi.mock('../../MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <span>{content}</span> }))
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

import { PanelChatView } from '../PanelChatView'
import { setConversationPopup } from '../../../../sessions/conversationPopup'
import { reply, session, system, tool, user } from './conversationFixtures'

const open = async (entries: unknown[], extra: Record<string, unknown> = {}) => {
  h.getSession.mockResolvedValue(session(entries, extra))
  render(<PanelChatView sessionId="s1" />)
  await screen.findByRole('textbox')
}

beforeEach(() => { vi.clearAllMocks(); setConversationPopup(false) })
afterEach(cleanup)


const failure = { reason: 'The site lost its connection to the model.' }

describe('a failed run @SC-694', () => {
  const first = [user('Summarise everything.', 30, { runId: 'r1' }), tool('Read', { file_path: '/a.md' }, 30, { runId: 'r1' }), system('RUN_FAILED', 31, { runId: 'r1', detail: failure })]

  it('stays where its reply would be, with the reason and one Try again while it is the latest reply', async () => {
    await open(first, { conversation: { replies: 1, failed: 1, latestFailure: { runId: 'r1', reason: failure.reason, message: 'Summarise everything.' }, contextUse: null } })
    expect(await screen.findByText(failure.reason)).toBeTruthy()
    fireEvent.click(screen.getByText('Try again'))
    await waitFor(() => expect(h.actions.tryAgain).toHaveBeenCalledWith({ sessionId: 's1' }))
  })

  it('folds to one line with no button once a newer message is sent', async () => {
    await open([...first, user('Hello?', 34, { runId: 'r2' }), reply('Hi.', 35, { runId: 'r2' })])
    expect(screen.queryByText('Try again')).toBeNull()
    fireEvent.click(await screen.findByText(/Failed · /))
    expect(await screen.findByText('Failed', { selector: 'span.font-medium' })).toBeTruthy()
  })

  it('folds a stopped run to a line saying who stopped it and what it did', async () => {
    await open([
      user('Fix the title.', 40, { runId: 'r1' }), tool('Read', { file_path: '/a.ts' }, 40, { runId: 'r1' }),
      system('RUN_STOPPED', 41, { runId: 'r1', detail: { cause: 'person', by: null } }),
    ])
    expect(await screen.findByText(/Stopped by you · /)).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

describe('an approval asked mid-run @SC-696', () => {
  const card = (answer: string, extra: Record<string, unknown> = {}) => ({
    answer, allowedFor: 'this_run', decidedBy: null, decidedByYou: false, decidedAt: null, reason: null,
    items: [{ does: 'Fetch a web page', why: 'the SDK release notes', command: false }, { does: 'npm install', why: null, command: true }],
    ...extra,
  })
  const asked = (c: unknown) => [user('Update the SDK.', 44, { runId: 'r1' }), system('APPROVAL_REQUESTED', 45, { runId: 'r1', approvalCard: c })]

  it('asks in plain words with Approve and Deny', async () => {
    await open(asked(card('waiting')))
    expect(await screen.findByText('Project manager needs your approval to go on')).toBeTruthy()
    expect(screen.queryByText(/manifest|extended access|bash prefixes/i)).toBeNull()
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(h.actions.approveManifest).toHaveBeenCalledWith({ runId: 'r1', sessionId: 's1' }))
  })

  it('shows every item while it waits, since Approve allows each one, and folds them once answered', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ does: `Step ${i + 1}`, why: null, command: false }))
    await open(asked(card('waiting', { items: many })))
    expect(await screen.findByText('Step 5')).toBeTruthy()
    expect(screen.queryByText(/more/)).toBeNull()
  })

  it('folds to one line once answered, opening to the same card with a link to the run', async () => {
    await open(asked(card('approved', { decidedBy: 'Avery', decidedAt: new Date(2026, 9, 10, 10, 52).toISOString() })))
    fireEvent.click(await screen.findByText(/Approved by Avery/))
    expect(await screen.findByText('Project manager asked for your approval')).toBeTruthy()
    expect(screen.getAllByText(/for this run only/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('View on the run ›'))
    expect(h.navigate).toHaveBeenCalledWith('/runs/r1?session=s1')
  })

  it('says so when a newer message replaced it', async () => {
    await open(asked(card('not_answered')))
    expect(await screen.findByText(/Not answered — replaced by a newer message/)).toBeTruthy()
  })
})
