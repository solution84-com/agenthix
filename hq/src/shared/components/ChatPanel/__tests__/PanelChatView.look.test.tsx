// @vitest-environment jsdom
/** The conversation's look (spec §5): the person's messages and the message box. */
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
  agent: { id: 'agent-1', name: 'Coder', defaultModel: 'claude-x', runtime: 'claude-sdk', avatarUrl: null },
  entries: [entry('e1', 'USER', 'Please fix the bug'), entry('e2', 'ASSISTANT', 'Fixed it')],
  ...extra,
})

// jsdom has no ResizeObserver; the chat view uses one to stay pinned to the bottom.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('the conversation look @SC-519 @SC-689', () => {
  it('shows the person\'s message as a right-aligned light block with a "You" line and no avatar', async () => {
    h.getSession.mockResolvedValue(session({}))
    const { container } = render(<PanelChatView sessionId="s1" />)

    const text = await screen.findByText('Please fix the bug')
    const block = text.parentElement as HTMLElement
    expect(block.className).toContain('bg-surface-2')
    expect(block.closest('.justify-end')).not.toBeNull()
    expect(screen.getByText('You')).toBeTruthy()
    expect(container.querySelector('svg.lucide-user')).toBeNull()
  })

  it('puts the message box on a white surface with the send button in the accent', async () => {
    h.getSession.mockResolvedValue(session({}))
    render(<PanelChatView sessionId="s1" />)

    const box = (await screen.findByRole('textbox')).closest('form') as HTMLElement
    expect(box.className).toContain('bg-surface-1')
    expect(box.className).toContain('border-border')
    const send = screen.getByRole('button', { name: /send/i })
    expect(send.className).toContain('bg-accent')
    expect(send.className).not.toContain('bg-surface-3')
  })
})
