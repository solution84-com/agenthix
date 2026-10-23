// @vitest-environment jsdom
/**
 * A conversation's approval bubble leaves the screen once its request is replaced: a newer run in the
 * conversation, which hq announces in the session's room as \`agentRunStatus\`. Rendered through the real
 * lifted chat view.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'

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
  getSessionPendingManifest: vi.fn(),
  handlers: new Map<string, (payload: unknown) => void>(),
}))
vi.mock('wasp/client/operations', () => ({
  useQuery: vi.fn(),
  useAction: () => vi.fn(),
  getSession: h.getSession,
  getProject: h.getProject,
  triggerAgentRun: 'triggerAgentRun',
  cancelAgentRun: 'cancelAgentRun',
  updateSession: 'updateSession',
  getSessionPendingManifest: h.getSessionPendingManifest,
  approveManifest: 'approveManifest',
  rejectManifest: 'rejectManifest',
  tryAgain: 'tryAgain',
  sendWaitingMessageNow: 'sendWaitingMessageNow',
  cancelWaitingMessage: 'cancelWaitingMessage',
  summariseConversation: 'summariseConversation',
}))
// A socket the test can push events through, as hq relays them into the session's room.
const socket = vi.hoisted(() => ({
  connected: true,
  emit: () => {},
  on: (event: string, handler: (payload: unknown) => void) => { h.handlers.set(event, handler) },
  off: (event: string) => { h.handlers.delete(event) },
}))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket }) }))
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('../../../utils/agentImageUrl', () => ({ resolveAgentImageUrl: async () => null }))
vi.mock('../../../hooks/useMayWork', () => ({ useMayWork: () => true, useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: 'no' }))
vi.mock('../../MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <span>{content}</span> }))

import { PanelChatView } from '../PanelChatView'

const session = {
  id: 's1', agentId: 'agent-1', title: 'Chat', status: 'ACTIVE', closedReason: null, model: null,
  totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
  metadata: null, primaryLocation: null,
  agent: { id: 'agent-1', name: 'Coder', avatarUrl: null },
  entries: [
    { id: 'e1', role: 'USER', content: 'Read the docs', createdAt: new Date().toISOString(), toolCalls: null, thinking: null, metadata: null },
    { id: 'e2', role: 'ASSISTANT', content: 'I need to fetch them', createdAt: new Date().toISOString(), toolCalls: null, thinking: null, metadata: null },
  ],
}
const request = { runId: 'r1', sessionId: 's1', summary: null, pendingManifest: { tools: [{ name: 'web_fetch' }], bashPatterns: [] } }

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

beforeEach(() => {
  vi.clearAllMocks()
  h.handlers.clear()
  h.getSession.mockResolvedValue(session)
  h.getSessionPendingManifest.mockResolvedValue(request)
})
afterEach(cleanup)

const push = (event: string, payload: unknown) => act(() => { h.handlers.get(event)?.(payload) })

describe("a conversation's approval bubble (every-screen-reviewed spec §9) @SC-643 @SC-696", () => {
  it('clears without a reload when a newer run starts in the conversation: the request was replaced', async () => {
    render(<PanelChatView sessionId="s1" />)
    expect(await screen.findByText('Fetch a web page')).toBeTruthy()

    push('agentRunStatus', { runId: 'r2', status: 'RUNNING' })

    await waitFor(() => expect(screen.queryByText('Fetch a web page')).toBeNull())
  })

  it("stays for news of the asking run itself", async () => {
    render(<PanelChatView sessionId="s1" />)
    expect(await screen.findByText('Fetch a web page')).toBeTruthy()

    push('agentRunStatus', { runId: 'r1', status: 'COMPLETED' })

    expect(screen.getByText('Fetch a web page')).toBeTruthy()
  })
})
