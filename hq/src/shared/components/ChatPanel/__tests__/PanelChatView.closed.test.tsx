// @vitest-environment jsdom
/**
 * adr-0076: a closed conversation shows its whole history, says why it is
 * closed, has no message box, and offers to start a new conversation with the
 * same agent, in the box of the place it worked in. Rendered through the real lifted chat view.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// The lifted view lives in ui/, which resolves its own copy of React and of the
// icon library; two Reacts cannot share hooks, so ui's copies are pointed at
// this module's.
vi.mock('../../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProject: vi.fn(),
  navigate: vi.fn(),
}))
// A used skill's line is hq's to give (useSessionSkillLines.test.ts); none here.
vi.mock('../useSessionSkillLines', () => ({ useSessionSkillLines: () => () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: vi.fn(),
  useAction: () => vi.fn(),
  getSession: h.getSession,
  getProject: h.getProject,
  triggerAgentRun: 'triggerAgentRun',
  cancelAgentRun: 'cancelAgentRun',
  updateSession: 'updateSession',
  getSessionPendingManifest: vi.fn(async () => null),
  approveManifest: 'approveManifest',
  rejectManifest: 'rejectManifest',
  tryAgain: 'tryAgain',
  sendWaitingMessageNow: 'sendWaitingMessageNow',
  cancelWaitingMessage: 'cancelWaitingMessage',
  summariseConversation: 'summariseConversation',
}))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null }) }))
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('../../../utils/agentImageUrl', () => ({ resolveAgentImageUrl: async () => null }))
vi.mock('../../../hooks/useMayWork', () => ({ useMayWork: () => true, useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: 'no' }))
vi.mock('../../MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <span>{content}</span> }))

import { PanelChatView } from '../PanelChatView'

const entry = (id: string, role: 'USER' | 'ASSISTANT', content: string) => ({
  id, role, content, createdAt: new Date().toISOString(), toolCalls: null, thinking: null, metadata: null,
})
const session = (extra: Record<string, unknown>) => ({
  id: 's1', agentId: 'agent-1', title: 'Old chat', status: 'ACTIVE', closedReason: null, model: null,
  totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
  metadata: null, primaryLocation: null,
  agent: { id: 'agent-1', name: 'Coder', avatarUrl: null },
  entries: [entry('e1', 'USER', 'Please fix the bug'), entry('e2', 'ASSISTANT', 'Fixed it')],
  ...extra,
})

// jsdom has no ResizeObserver; the chat view uses one to stay pinned to the bottom.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('a closed conversation @SC-499', () => {
  it('shows its history and why it is closed, with no message box', async () => {
    h.getSession.mockResolvedValue(session({ status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' }))
    render(<PanelChatView sessionId="s1" />)

    expect(await screen.findByText('This conversation is closed')).toBeTruthy()
    expect(screen.getByText(/no longer has this conversation's context/)).toBeTruthy()
    expect(screen.getByText('Please fix the bug')).toBeTruthy()
    expect(screen.getByText('Fixed it')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
  })

  it('opens Chat\'s message box with the same agent picked', async () => {
    h.getSession.mockResolvedValue(session({ status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' }))
    render(<PanelChatView sessionId="s1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Start a new conversation' }))

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/chat?agent=agent-1'))
  })

  it('opens the message box of the project it worked in, with the same agent picked', async () => {
    h.getSession.mockResolvedValue(session({
      status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING',
      primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: 'w1',
    }))
    h.getProject.mockResolvedValue({ key: 'ACME', personalOwnerId: null })
    render(<PanelChatView sessionId="s1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Start a new conversation' }))

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/projects/ACME?agent=agent-1'))
  })

  it('names the agent in the message box', async () => {
    h.getSession.mockResolvedValue(session({}))
    render(<PanelChatView sessionId="s1" />)

    expect(((await screen.findByRole('textbox')) as HTMLTextAreaElement).placeholder).toBe('Message Coder…')
  })

  it('keeps the message box while the conversation is open', async () => {
    h.getSession.mockResolvedValue(session({}))
    render(<PanelChatView sessionId="s1" />)

    expect(await screen.findByRole('textbox')).toBeTruthy()
    expect(screen.queryByText('This conversation is closed')).toBeNull()
  })
})
