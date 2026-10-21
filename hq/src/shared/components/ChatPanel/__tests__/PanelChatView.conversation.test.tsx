// @vitest-environment jsdom
/** What a conversation shows (every screen reviewed): who replied, the icons under a reply, the work line, the popup. */
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

describe('who replied, and when @SC-689', () => {
  it('heads a reply with the agent and its time, and shows the model once where it changed', async () => {
    await open([
      user('Turn them into tasks.', 24, { runId: 'r1' }), reply('Done.', 26, { runId: 'r1' }),
      user('Which is riskiest?', 40, { runId: 'r2' }), reply('AGX-42.', 40, { runId: 'r2', model: 'claude-opus-4-5' }),
    ])
    expect(screen.getAllByText('Project manager')).toHaveLength(2)
    expect(screen.queryByText(/claude-sonnet-4-6/)).toBeNull()
    expect(screen.getAllByText(/Now using/)).toHaveLength(1)
    expect(screen.getByText(/Now using Claude Opus 4\.5/)).toBeTruthy()
  })

  it('puts Copy, Usage and Details under a reply, and opens the usage in a popup @SC-690', async () => {
    await open([user('Hi', 24, { runId: 'r1' }), reply('Hello.', 26, { runId: 'r1' })])
    expect(screen.getAllByLabelText('Copy').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Usage'))
    expect(await screen.findByText('Usage · this reply')).toBeTruthy()
    expect(screen.getByText('Energy and CO₂ are a flat estimate per token.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Details'))
    expect(h.navigate).toHaveBeenCalledWith('/runs/r1?session=s1')
  })
})

describe('the work line @SC-691', () => {
  const run = [
    user('Look at the tasks', 24, { runId: 'r1' }),
    tool('mcp__platform__list_tasks', { projectKey: 'AGX' }, 24, { runId: 'r1' }),
    tool('Read', { file_path: '/repo/a.ts' }, 25, { runId: 'r1' }),
    tool('Read', { file_path: '/repo/b.ts' }, 25, { runId: 'r1' }),
    tool('Bash', { command: 'npm test' }, 25, { runId: 'r1' }),
    reply('Done.', 26, { runId: 'r1' }),
  ]

  it('names what was done on one folded line, and opens to every step with a link to the run', async () => {
    await open(run)
    expect(screen.queryByText('Open the run ›', { exact: false })).toBeNull()
    fireEvent.click(screen.getByText(/read 2 files/i))
    expect(await screen.findByText('npm test')).toBeTruthy()
    fireEvent.click(screen.getByText(/Open the run/))
    expect(h.navigate).toHaveBeenCalledWith('/runs/r1?session=s1')
  })
})

describe('a reply in progress @SC-692', () => {
  it('keeps the message box open and shows Stop beside Send while the agent works', async () => {
    await open([user('Run the tests', 24, { runId: 'r1', runStatus: 'RUNNING' })])
    expect(await screen.findByText('Stop')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Also the phone layout' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(h.actions.triggerAgentRun).toHaveBeenCalledWith({ sessionId: 's1', inputText: 'Also the phone layout' }))
  })

  it('shows Send now and Cancel on a message waiting behind the reply', async () => {
    await open([
      user('Run the tests', 24, { runId: 'r1', runStatus: 'RUNNING' }),
      user('Also the phone layout', 25, { runId: 'r2', runStatus: 'PENDING' }),
    ])
    expect(await screen.findByText('Waits for the reply to finish')).toBeTruthy()
    fireEvent.click(screen.getByText('Send now'))
    await waitFor(() => expect(h.actions.sendWaitingMessageNow).toHaveBeenCalledWith({ sessionId: 's1', runId: 'r2' }))
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(h.actions.cancelWaitingMessage).toHaveBeenCalledWith({ sessionId: 's1', runId: 'r2' }))
  })
})

describe("the conversation's popup @SC-697", () => {
  it('shows when it started, its replies and the agent\'s memory, and Summarise now starts at once', async () => {
    const contextUse = { tokens: 124_000, summarisesAt: 184_000, window: 200_000, at: new Date().toISOString() }
    await open([user('Hi', 24, { runId: 'r1' }), reply('Hello.', 26, { runId: 'r1' })], {
      conversation: { replies: 14, failed: 1, latestFailure: null, contextUse },
    })
    act(() => setConversationPopup(true))
    expect(await screen.findByText('Usage · this conversation')).toBeTruthy()
    expect(screen.getByText('14 · 1 failed')).toBeTruthy()
    expect(screen.getByText('62% · 124.0k of 200.0k tokens')).toBeTruthy()
    expect(screen.getByText(/summarises itself at about 92%/)).toBeTruthy()
    fireEvent.click(screen.getByText('Summarise now'))
    await waitFor(() => expect(h.actions.summariseConversation).toHaveBeenCalledWith({ sessionId: 's1' }))
    expect(screen.queryByText(/tok$/)).toBeNull()
  })
})

describe('the conversation records, kept @SC-698', () => {
  it('shows the nearly-full notice from 90%, and a summarised marker opening to what the agent remembers', async () => {
    const contextUse = { tokens: 188_000, summarisesAt: null, window: 200_000, at: new Date().toISOString() }
    await open([
      user('Hi', 24, { runId: 'r1' }),
      system('CONTEXT_SUMMARISED', 25, { runId: 'r1', detail: { trigger: 'auto', summary: 'Avery is redesigning the project page.', tokensBefore: 1, byId: null } }),
      reply('Hello.', 26, { runId: 'r1' }),
    ], { conversation: { replies: 1, failed: 0, latestFailure: null, contextUse } })
    expect(await screen.findByText(/nearly full/)).toBeTruthy()
    fireEvent.click(screen.getByText(/The agent summarised everything above to make room/))
    expect(await screen.findByText('What the agent remembers now')).toBeTruthy()
    expect(screen.getByText('Avery is redesigning the project page.')).toBeTruthy()
  })
})
