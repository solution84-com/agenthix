// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown) => void>(),
  thread: {} as Record<string, unknown>,
  voice: {} as Record<string, unknown>,
  summarise: vi.fn(),
  keep: vi.fn(),
  archive: vi.fn(),
  securePage: true,
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/webSocket', () => ({
  useSocket: () => ({
    socket: {
      on: (event: string, fn: (e: unknown) => void) => { h.handlers.set(event, fn) },
      off: (event: string) => { h.handlers.delete(event) },
      emit: () => {},
    },
  }),
}))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  useQuery: () => ({ data: undefined, error: null, isLoading: true }),
  // The box's photos and files: kept through these, and the model's list read for which models see images.
  useAction: () => vi.fn(),
  shareConversationFile: 'shareConversationFile',
  setConversationModel: 'setConversationModel',
  getModelChoices: 'getModelChoices',
  getConversationDeletePreview: 'getConversationDeletePreview',
  deleteConversation: vi.fn(),
  summariseConversationNow: (args: unknown) => h.summarise(args),
  setConversationKeep: (args: unknown) => h.keep(args),
  archiveConversation: (args: unknown) => h.archive(args),
  renameConversation: vi.fn(),
  getOperationResult: 'getOperationResult',
  getAnswerFacts: 'getAnswerFacts',
  getReplyVoice: 'getReplyVoice',
  getUserSettings: 'getUserSettings',
  speakAnswer: vi.fn(),
  getConversationPlaces: 'getConversationPlaces',
  getAssetRequestChange: 'getAssetRequestChange',
}))
// jsdom is not a secure page: it has no microphone, so each test says whether the page has one.
vi.mock('../../../shared/securePage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/securePage')>(),
  microphonePossible: () => h.securePage,
}))
// The demo's suggestions (ADR-0186) are none here: the demo is off.
vi.mock('../../../demo/lead/useSuggestedPrompts', () => ({ useSuggestedPrompts: () => [] }))
vi.mock('../../../shared/providers/VoiceCallProvider', () => ({ useVoiceCall: () => h.voice }))
vi.mock('../../hooks/useConversationWorkflowRuns', () => ({ useConversationWorkflowRuns: () => [] }))
vi.mock('../../hooks/useConversationThread', () => ({ useConversationThread: () => h.thread }))
vi.mock('../../../agents/profile/AgentProfileCard', () => ({ AgentProfileTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

vi.mock('../ConversationPlaces', () => ({
  ConversationPlaces: ({ agentName, canChange }: { agentName: string; canChange: boolean }) => (
    <span data-testid="places-for" data-agent={agentName} data-can-change={String(canChange)} />
  ),
}))
vi.mock('../ConversationModelPicker', () => ({
  ConversationModelPicker: ({ conversationId }: { conversationId: string }) => (
    <span data-testid="model-picker-for">{conversationId}</span>
  ),
}))

import { ToastHost } from '@agenthix/ui/attention'
import { ConversationThread } from '../ConversationThread'

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const baseView = {
  id: 'c1', home: 'PERSON', projectId: null, taskId: null, title: 'Budget', status: 'ACTIVE', closedReason: null, agent,
  lastMessageAt: '2026-10-16T10:00:00.000Z', openedById: 'u1', talkingModel: null, activeTurnId: null, waiting: [],
  accessProblem: null, accessOffer: null, canSpeak: true, voice: { available: false, unavailableReason: null, holderId: null, startedAt: null }, people: [], keep: false,
}
const voiceOff = {
  conversationId: null, agent: null, returnTo: null, phase: 'off', muted: false, partial: '', reveal: null,
  warningEndsAt: null, notice: null, noticeFor: null, outstanding: null,
}
const stopFn = vi.fn()
const switchFn = vi.fn()
const stopOpFn = vi.fn()

beforeEach(() => {
  h.securePage = true
  h.voice = {
    voice: voiceOff, start: vi.fn(), end: vi.fn(), toggleMute: vi.fn(), stopSpeaking: () => false, clearNotice: vi.fn(),
    revealLimit: () => null,
  }
  stopFn.mockReset()
  switchFn.mockReset()
  stopOpFn.mockReset()
  h.thread = {
    view: baseView, viewQuery: { data: undefined, error: null, dataUpdatedAt: 0, refetch: vi.fn() }, loaded: true, messages: [], waiting: [], hasMore: false, loadingOlder: false,
    loadOlder: vi.fn(), stream: null, running: false, nudges: { nudges: [], push: vi.fn(), clear: vi.fn() }, sendError: null, sendAgain: vi.fn(), refetchView: vi.fn(), sending: false,
    send: vi.fn(), stop: stopFn, sendNow: vi.fn(), cancelWaiting: vi.fn(), switchAccess: switchFn,
    activityRows: [], activityLoaded: true, liveLines: {}, answering: false, answerApproval: vi.fn(), stopOperation: stopOpFn,
  }
})
afterEach(cleanup)

/** The lines the thread was handed for its foot, in their words. */
const pushed = () => (h.thread.nudges as { push: { mock: { calls: { text: string }[][] } } }).push.mock.calls.map((c) => c[0]!.text)

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output> }
const renderThread = () => render(<MemoryRouter><ConversationThread conversationId="c1" listPath="/chat" /><Where /></MemoryRouter>)

describe('a conversation on screen @SC-1004 @SC-1933', () => {
  it('has a message box under the thread @SC-1007', () => {
    renderThread()
    expect(screen.getByLabelText('Message Kernel…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('puts the title first in the header, with who leads on its line, and the model as its own chip in the box @SC-1007', () => {
    renderThread()
    const header = screen.getByTestId('conversation-header')
    expect(header.querySelector('h1')?.textContent).toBe('Budget')
    expect(header.textContent).toContain('Kernel')
    expect(screen.queryByTestId('conversation-model-row')).toBeNull()
    expect(header.querySelector('[data-testid="model-picker-for"]')).toBeNull()
    expect(screen.getByTestId('message-actions').querySelector('[data-testid="model-picker-for"]')?.textContent).toBe('c1')
    // ＋ adds a photo or file (improvement 15); a pointer that hovers has no camera to offer.
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menuitem', { name: /^Photo or file/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Take a photo/ })).toBeNull()
  })

  it('holds the places in the header itself, not in a strip of their own @SC-1441', () => {
    renderThread()
    expect(screen.getByTestId('conversation-header').querySelector('[data-testid="places-for"]')).toBeTruthy()
    expect(screen.queryByTestId('conversation-places-strip')).toBeNull()
  })

  it('has no model picker where the person cannot write @SC-1007', () => {
    h.thread.view = { ...baseView, canSpeak: false }
    renderThread()
    expect(screen.queryByTestId('model-picker-for')).toBeNull()
  })

  it('shows Thinking in the name line, the live line above the box, and Stop while a reply runs, and Stop stops it @SC-1005', () => {
    h.thread.running = true
    renderThread()
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thinking›')
    expect(screen.getByTestId('live-line').textContent).toBe('Kernel is thinking0 s')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stopFn).toHaveBeenCalledTimes(1)
  })

  it('streams the words under the pill, in the same block, with no Copy until the turn ends', () => {
    h.thread.running = true
    h.thread.stream = { turnId: 't1', text: 'Let me look' }
    renderThread()
    expect(screen.getByTestId('streaming-reply').textContent).toContain('Let me look')
    expect(screen.getAllByTestId('agent-block')).toHaveLength(1)
    expect(screen.queryByTestId('reply-actions')).toBeNull()
    // Writing is seen in the thread itself: the line above the box says nothing then.
    expect(screen.queryByTestId('live-line')).toBeNull()
  })

  it('greys the message box on a closed conversation: the tooltip says why, a press gives the way to start a new one with the agent @SC-943 @SC-1911', () => {
    h.thread.view = { ...baseView, status: 'CLOSED', closedReason: 'PROJECT_DELETED' }
    renderThread()
    const pill = screen.getByTestId('message-pill')
    expect(pill.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(pill)
    expect(screen.getByTestId('tooltip').textContent).toBe('This conversation is closed')
    fireEvent.click(pill)
    expect(screen.getByTestId('attention-text').textContent).toContain('its project was deleted')
    fireEvent.click(screen.getByRole('button', { name: /Start a new conversation with this agent/ }))
    expect(screen.getByTestId('where').textContent).toBe('/chat?agent=a1')
  })

  it('says it is read-only to someone who may read but not write', () => {
    h.thread.view = { ...baseView, canSpeak: false }
    renderThread()
    expect(screen.queryByLabelText('Message Kernel…')).toBeNull()
    expect(screen.getByText('You can read this conversation but not write in it.')).toBeTruthy()
  })

  it('offers the next access when the current one stopped being usable, and switches on the person\'s say @SC-952', () => {
    h.thread.view = { ...baseView, accessProblem: 'The organisation\'s key was removed.', accessOffer: { label: 'your own key' } }
    renderThread()
    fireEvent.click(screen.getByTestId('message-pill'))
    expect(screen.getByTestId('attention-text').textContent).toContain('The organisation\'s key was removed.')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to your own key' }))
    expect(switchFn).toHaveBeenCalledTimes(1)
  })

  it('says a conversation that cannot be answered by greying its box, not by a band beside it @SC-952 @SC-1911', () => {
    h.thread.view = { ...baseView, accessProblem: 'No model provider is working. An organisation admin can add one, or fix the one there is, under Manage organisation › Providers.' }
    renderThread()
    const pill = screen.getByTestId('message-pill')
    fireEvent.mouseEnter(pill)
    expect(screen.getByTestId('tooltip').textContent).toContain('No model provider is working.')
    fireEvent.click(pill)
    expect(screen.getByTestId('attention-text').textContent).toContain('An administrator has been told.')
    expect(screen.queryByTestId('access-line')).toBeNull()
  })

  it('leaves the problem to the failed turn\'s own words, and keeps the box, once a reply has failed on it @SC-952', () => {
    h.thread.view = { ...baseView, accessProblem: 'Anthropic is not working. An organisation admin has been told.', accessOffer: { label: 'OpenRouter' } }
    h.thread.messages = [
      { id: 'p1', seq: 1, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT', body: { text: 'Summarise it' }, turnId: 't1', createdAt: '2026-10-16T10:00:00.000Z' },
      { id: 'f1', seq: 2, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'FAILED', body: { reason: 'Anthropic refused the key HQ uses. An organisation admin can check it under Manage organisation › Providers.' }, turnId: 't1', createdAt: '2026-10-16T10:00:01.000Z' },
    ]
    renderThread()
    expect(screen.queryByTestId('access-line')).toBeNull()
    expect(screen.getByLabelText('Message Kernel…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to OpenRouter' }))
    expect(switchFn).toHaveBeenCalledTimes(1)
  })

  it('sends the person\'s message again on Try again @SC-1005', () => {
    h.thread.messages = [
      { id: 'p1', seq: 1, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT', body: { text: 'Summarise it' }, turnId: 't1', createdAt: '2026-10-16T10:00:00.000Z' },
      { id: 'f1', seq: 2, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'FAILED', body: { reason: 'Anthropic could not answer. Try again.' }, turnId: 't1', createdAt: '2026-10-16T10:00:01.000Z' },
    ]
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.thread.sendAgain).toHaveBeenCalledWith('Summarise it')
  })

  it('shows the reason of a refused action as a line after the last message, with Try again, never a dialog @SC-1012', () => {
    const retry = vi.fn()
    const clear = vi.fn()
    h.thread.nudges = { nudges: [{ key: 'stop', text: 'The reply was not stopped: This conversation is closed.', retry }], push: vi.fn(), clear }
    renderThread()
    const line = screen.getByText('The reply was not stopped: This conversation is closed.')
    expect(line.getAttribute('role')).toBe('status')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    expect(clear).toHaveBeenCalledWith('stop')
  })

  it('keeps a message not sent in the box, "Not sent", with Send again (decision 2)', () => {
    h.thread.sendError = 'HQ did not answer.'
    renderThread()
    const slot = screen.getByTestId('message-box-slot')
    expect(slot.textContent).toContain('Not sent: HQ did not answer.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy()
  })

  it('says the conversation could not be read in place of it, with Try again, when nothing of it is held', () => {
    const refetch = vi.fn()
    h.thread.view = undefined
    h.thread.viewQuery = { data: undefined, error: new Error('down'), dataUpdatedAt: 0, refetch }
    renderThread()
    expect(screen.getByText('The conversation could not be read')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('keeps the thread on screen when a re-read of it fails', () => {
    h.thread.viewQuery = { data: baseView, error: new Error('down'), dataUpdatedAt: Date.now(), refetch: vi.fn() }
    renderThread()
    expect(screen.getByLabelText('Message Kernel…')).toBeTruthy()
    expect(screen.queryByText('The conversation could not be read')).toBeNull()
  })
})

const row = (over: Record<string, unknown> = {}) => ({
  operationId: 'o1', kind: 'WORKER', title: 'Profile the image pipeline', state: 'RUNNING', word: 'working', boundaryName: 'Shop',
  lines: ['Shop · Measure resize times'], endedHelpers: 0, canStop: true, createdAt: '2026-10-16T10:00:00.000Z', ...over,
})

describe('the work bar @SC-1009', () => {
  it('is not there when nothing is live, and the header has no count of work', () => {
    h.thread.activityRows = [row({ operationId: 'o2', state: 'COMPLETED', word: 'completed', canStop: false, lines: [] })]
    renderThread()
    expect(screen.queryByTestId('work-bar')).toBeNull()
    expect(screen.queryByTestId('activity-indicator')).toBeNull()
  })

  it('is the last thing in the thread, inside its scroll, collapsed to one line', () => {
    h.thread.activityRows = [row(), row({ operationId: 'o2' })]
    h.thread.messages = [agentMessage]
    renderThread()
    const scroll = screen.getByTestId('thread-messages')
    const bar = screen.getByTestId('work-bar')
    expect(scroll.contains(bar)).toBe(true)
    expect(bar.parentElement!.lastElementChild).toBe(bar)
    expect(screen.getByTestId('work-bar-heading').textContent).toBe('2 working')
    expect(screen.queryByTestId('work-bar-list')).toBeNull()
  })

  it('opens to a row per work, its live lines and Stop, and Stop stops it', () => {
    h.thread.activityRows = [row({ endedHelpers: 2, runHref: '/runs/r1?session=s1&conversation=c1' })]
    h.thread.liveLines = { o1: { lines: ['Shop · Profile it · Measure resize times'], endedHelpers: 3 } }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: /1 working/ }))
    const list = screen.getByTestId('work-bar-list')
    expect(list.textContent).toContain('Profile the image pipeline · Shop · working')
    expect(list.textContent).toContain('Shop · Profile it · Measure resize times')
    expect(list.textContent).toContain('3 parts done')
    expect(list.textContent).not.toMatch(/helper|worker|operation/i)
    expect(screen.getByRole('link', { name: 'Profile the image pipeline' }).getAttribute('href')).toBe('/runs/r1?session=s1&conversation=c1')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stopOpFn).toHaveBeenCalledWith('o1')
  })

  it('offers no Stop to someone who may not stop it', () => {
    h.thread.activityRows = [row({ canStop: false })]
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: /1 working/ }))
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('leaves a request for the okay out: it is its card in the thread, and the strip keeps it in view', () => {
    h.thread.activityRows = [
      row(),
      row({ operationId: 'o2', title: 'Review chapter 1', state: 'WAITING_FOR_APPROVAL', word: 'waiting', request: { what: 'Run "git diff"', reason: 'x', askedBy: 'Kernel' } }),
    ]
    renderThread()
    expect(screen.getByTestId('work-bar-heading').textContent).toBe('1 working')
    fireEvent.click(screen.getByRole('button', { name: /1 working/ }))
    expect(screen.getByTestId('work-bar-list').textContent).not.toContain('git diff')
  })

  it('leaves out a task set for a time: setting it completed it', () => {
    h.thread.activityRows = [row({ kind: 'TASK', state: 'COMPLETED', word: 'completed' })]
    renderThread()
    expect(screen.queryByTestId('work-bar')).toBeNull()
  })

})

describe('the header\'s tools', () => {
  it('offers Delete to the one who opened the conversation, and opens the confirm @SC-975', () => {
    renderThread()
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    expect(screen.getByTestId('delete-confirm')).toBeTruthy()
  })

  it('has Summarise now in the conversation\'s menu, and it summarises this conversation @SC-983', async () => {
    h.summarise.mockResolvedValue(undefined)
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Summarise now/ }))
    expect(h.summarise).toHaveBeenCalledWith({ conversationId: 'c1' })
  })

  it('keeps the conversation out of archiving from its menu, for the one who opened it @SC-974', () => {
    h.keep.mockResolvedValue(undefined)
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^Keep it/ }))
    expect(h.keep).toHaveBeenCalledWith({ conversationId: 'c1', keep: true })
  })

  it('says Keep it worked with a toast, since the menu closes on it', async () => {
    h.keep.mockResolvedValue(undefined)
    render(<MemoryRouter><ConversationThread conversationId="c1" listPath="/chat" /><ToastHost /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^Keep it/ }))
    expect((await screen.findByTestId('toast')).textContent).toBe('Kept out of archiving')
  })

  it('returns at once and shows Summarising… in the thread until the marker arrives over the socket @SC-983', async () => {
    h.summarise.mockResolvedValue(undefined)
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Summarise now/ }))
    expect((await screen.findByTestId('summarising')).textContent).toContain('Summarising…')
    act(() => h.handlers.get('conversation:message')!({ conversationId: 'c1', message: { kind: 'SUMMARISED', role: 'PLATFORM' } }))
    expect(screen.queryByTestId('summarising')).toBeNull()
  })

  it('shows why when the summary fails after it started @SC-983', async () => {
    h.summarise.mockResolvedValue(undefined)
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Summarise now/ }))
    await screen.findByTestId('summarising')
    act(() => h.handlers.get('conversation:summarise')!({ conversationId: 'c1', state: 'failed', reason: 'Could not summarise just now.' }))
    expect(screen.queryByTestId('summarising')).toBeNull()
    expect(pushed()).toContain('The conversation was not summarised: Could not summarise just now.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says why when Summarise now is refused @SC-983', async () => {
    h.summarise.mockRejectedValue(new Error('There is nothing to summarise yet'))
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Summarise now/ }))
    await vi.waitFor(() => expect(pushed()).toContain('The conversation was not summarised: There is nothing to summarise yet'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no Summarise now where the person cannot write or the conversation is closed, but still Show its runs @SC-983', () => {
    h.thread.view = { ...baseView, canSpeak: false }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.queryByRole('menuitem', { name: /^Summarise now/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Show its runs' })).toBeTruthy()
    cleanup()
    h.thread.view = { ...baseView, status: 'CLOSED', closedReason: 'PROJECT_DELETED' }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.queryByRole('menuitem', { name: /^Summarise now/ })).toBeNull()
  })

  it('offers no Delete or Archive to anyone else @SC-975', () => {
    h.thread.view = { ...baseView, openedById: 'someone-else' }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull()
  })

  it('archives from the menu for the one who opened it, without a confirm @SC-974', async () => {
    h.archive.mockResolvedValue(undefined)
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    await vi.waitFor(() => expect(h.archive).toHaveBeenCalledWith({ conversationId: 'c1' }))
    expect(screen.queryByTestId('delete-confirm')).toBeNull()
  })

  it('offers Rename to anyone who may write in an open conversation, and opens its dialog', () => {
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Budget')
    cleanup()
    h.thread.view = { ...baseView, openedById: 'someone-else' }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy()
    cleanup()
    h.thread.view = { ...baseView, canSpeak: false }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull()
  })
})

describe('the places strip @SC-1441', () => {
  it('names the agent and lets the one who opened the conversation change the places', () => {
    renderThread()
    const strip = screen.getByTestId('places-for')
    expect(strip.getAttribute('data-agent')).toBe('Kernel')
    expect(strip.getAttribute('data-can-change')).toBe('true')
  })

  it('is read-only for anyone else, and for a closed conversation', () => {
    h.thread.view = { ...baseView, openedById: 'someone-else' }
    renderThread()
    expect(screen.getByTestId('places-for').getAttribute('data-can-change')).toBe('false')
    cleanup()
    h.thread.view = { ...baseView, status: 'CLOSED' }
    renderThread()
    expect(screen.getByTestId('places-for').getAttribute('data-can-change')).toBe('false')
  })
})

const voiceOn = (over: Record<string, unknown> = {}) => ({
  ...voiceOff, conversationId: 'c1', phase: 'listening', returnTo: '/chat/c/c1', agent: { name: 'Kernel', avatarUrl: null }, ...over,
})
const shownReply = 'Here you go.\n\n:::shown The three steps\n> I put the steps in the thread.\n1. Measure\n2. Fix\n:::\n\nAnything else?'
const agentMessage = { id: 'm2', seq: 2, kind: 'TEXT', role: 'AGENT', turnId: 't1', createdAt: '2026-10-16T10:01:00.000Z', queueState: 'DELIVERED', body: { text: shownReply }, spoken: false, interrupted: false }

describe('voice in the conversation', () => {
  it('starts voice from the right button when the box is empty and voice is available @SC-994', () => {
    const start = vi.fn()
    h.voice.start = start
    h.thread.view = { ...baseView, voice: { available: true, unavailableReason: null, holderId: null, startedAt: null } }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
    expect(start).toHaveBeenCalledWith('c1', { id: 'a1', handle: 'kernel', name: 'Kernel', avatarUrl: null })
  })

  it('shows Mute and End in the pill in voice mode, and the line above the box says the agent is listening @SC-994 @SC-1927', () => {
    h.voice.voice = voiceOn()
    renderThread()
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'End the call' })).toBeTruthy()
    expect(screen.getByTestId('voice-line').getAttribute('data-state')).toBe('listening')
    expect(screen.getByTestId('voice-line').textContent).toBe('Kernel is listening')
    expect(screen.queryByTestId('voice-glow')).toBeNull()
    expect(screen.getByTestId('message-pill').getAttribute('data-speaker')).toBe('listening')
  })

  it("in the demo's scripted call, leaves the call's state to its own panel and says only thinking above the box", () => {
    h.voice.say = vi.fn()
    h.voice.voice = voiceOn()
    const { unmount } = renderThread()
    expect(screen.queryByTestId('voice-line')).toBeNull()
    unmount()
    h.thread.running = true
    renderThread()
    expect(screen.getByTestId('live-line')).toBeTruthy()
  })

  it('does not treat another conversation’s voice as voice here @SC-1001', () => {
    h.voice.voice = voiceOn({ conversationId: 'other' })
    renderThread()
    expect(screen.queryByRole('button', { name: 'Mute' })).toBeNull()
    expect(screen.queryByTestId('voice-line')).toBeNull()
  })

  it('shows what the person is saying before it is sent @SC-995 @SC-1921', () => {
    h.voice.voice = voiceOn({ partial: 'book the meeting' })
    renderThread()
    expect(screen.getByTestId('listening-bubble').textContent).toContain('book the meeting')
    // The line says what the agent is doing; the person's own words are their bubble.
    expect(screen.getByTestId('voice-line').textContent).toBe('Kernel is listening')
  })

  it('draws a shown part as a card in voice mode and opens it beside the thread without ending voice @SC-996', () => {
    const end = vi.fn()
    h.voice.end = end
    h.voice.voice = voiceOn({ phase: 'speaking' })
    h.thread.messages = [agentMessage]
    renderThread()
    expect(screen.queryByTestId('shown-inline')).toBeNull()
    const card = screen.getByTestId('shown-card')
    expect(card.textContent).toContain('The three steps')
    fireEvent.click(card)
    const viewer = screen.getByTestId('shown-viewer')
    expect(viewer.textContent).toContain('1. Measure')
    expect(end).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('shown-viewer')).toBeNull()
  })

  it('draws the same part inline outside voice mode, without its spoken line @SC-996', () => {
    h.thread.messages = [agentMessage]
    renderThread()
    expect(screen.queryByTestId('shown-card')).toBeNull()
    const inline = screen.getByTestId('shown-inline')
    expect(inline.textContent).toContain('The three steps')
    expect(inline.textContent).toContain('1. Measure')
    expect(inline.textContent).not.toContain('I put the steps')
  })

  it('lays a streaming reply out only to the end of the sentence the voice is revealing @SC-995 @SC-1913', () => {
    const sentence = { index: 0, textStart: 0, textEnd: 12, words: ['Here', 'you', 'go'], wordStartSecs: [0, 0.3, 0.6] }
    h.voice.voice = voiceOn({ phase: 'speaking', reveal: { turnId: 't1', head: { index: 0, elapsed: 0, ended: false }, sentences: [sentence] } })
    h.thread.running = true
    h.thread.stream = { turnId: 't1', text: 'Here you go. Then more.' }
    renderThread()
    expect(screen.getByTestId('streaming-reply').textContent).toBe('Here you go.')
  })

  it('shows nothing of a reply, only its pill, before its first words are heard @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'speaking', reveal: { turnId: 't1', head: null, sentences: [] } })
    h.thread.running = true
    h.thread.stream = { turnId: 't1', text: 'Here you go.' }
    renderThread()
    expect(screen.queryByTestId('streaming-reply')).toBeNull()
    expect(screen.getByTestId('thinking-pill')).toBeTruthy()
  })

  it('holds back the committed reply too while it is still being spoken @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'speaking', reveal: { turnId: 't1', head: null, sentences: [] } })
    h.thread.messages = [{ ...agentMessage, body: { text: 'Done.' } }]
    renderThread()
    expect(screen.queryByText('Done.')).toBeNull()
  })

  it('keeps a finished reply’s name line, still thinking, until its voice starts @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'thinking', reveal: { turnId: 't1', head: null, sentences: [] } })
    h.thread.messages = [{ ...agentMessage, body: { text: 'Done.' } }]
    renderThread()
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thinking›')
    expect(screen.queryByText('Done.')).toBeNull()
  })

  it('greys the voice button with the reason, and says it on a tap @SC-994 @SC-1911', () => {
    h.thread.view = { ...baseView, voice: { available: false, unavailableReason: 'Kernel has no voice.', holderId: null, startedAt: null } }
    renderThread()
    const button = screen.getByRole('button', { name: /Start voice/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(button)
    expect(screen.getByTestId('tooltip').textContent).toBe('Kernel has no voice.')
    fireEvent.click(button)
    expect(screen.getByTestId('attention-text').textContent).toBe('Kernel has no voice.')
    expect(h.voice.start).not.toHaveBeenCalled()
  })

  it('greys it on a page that is not secure, saying voice needs https or this computer', () => {
    h.securePage = false
    h.thread.view = { ...baseView, voice: { available: true, unavailableReason: null, holderId: null, startedAt: null } }
    renderThread()
    const button = screen.getByRole('button', { name: /Start voice/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(screen.getByTestId('attention-text').textContent).toMatch(/need a secure page: open HQ over https, or on this computer at localhost/)
    expect(h.voice.start).not.toHaveBeenCalled()
  })

  it('greys it when someone else holds voice here @SC-994', () => {
    h.thread.view = { ...baseView, voice: { available: true, unavailableReason: null, holderId: 'someone-else', startedAt: '2026-10-16T10:00:00.000Z' } }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: /Start voice/ }))
    expect(screen.getByTestId('attention-text').textContent).toContain('Someone else is using voice')
  })

  it('offers End, not Stop, in the right slot while a reply runs in a call @SC-997', () => {
    h.voice.voice = voiceOn({ phase: 'speaking' })
    h.thread.running = true
    renderThread()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'End the call' }))
    expect(h.voice.end).toHaveBeenCalled()
    expect(stopFn).not.toHaveBeenCalled()
  })

  it('says the silence warning on the call bar, and why voice ended as a line in the thread with Start voice, never a dialog @SC-1000 @SC-1910', () => {
    h.voice.voice = voiceOn({ warningEndsAt: Date.now() + 15000 })
    renderThread()
    expect(screen.getByTestId('voice-line').textContent).toContain('No one has spoken for a while.')
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    h.voice.voice = { ...voiceOff, notice: 'Voice ended after two quiet minutes.', noticeFor: 'c1' }
    renderThread()
    const line = screen.getAllByRole('status').find((el) => el.textContent?.includes('Voice ended after two quiet minutes.'))!
    expect(line).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(within(line).getByRole('button', { name: 'Start voice' }))
    expect(h.voice.start).toHaveBeenCalled()
  })

  it('draws the quiet lines of voice starting and ending, with its length @SC-994', () => {
    h.thread.messages = [
      { id: 'v1', seq: 1, kind: 'VOICE_STARTED', role: 'SYSTEM', turnId: null, createdAt: '2026-10-16T10:00:00.000Z', queueState: 'DELIVERED', body: { byUserId: 'u1' }, spoken: false, interrupted: false },
      { id: 'v2', seq: 2, kind: 'VOICE_ENDED', role: 'SYSTEM', turnId: null, createdAt: '2026-10-16T10:04:00.000Z', queueState: 'DELIVERED', body: { byUserId: 'u1', durationSec: 240, reason: 'no one spoke for two minutes' }, spoken: false, interrupted: false },
    ]
    renderThread()
    expect(screen.getByText(/^Voice · /)).toBeTruthy()
    expect(screen.getByText('Voice ended · 4 min · no one spoke for two minutes')).toBeTruthy()
  })
})

describe('an interrupted reply with nothing heard @SC-997', () => {
  it('shows only the stopped line, no empty bubble text', () => {
    h.thread.messages = [{ ...agentMessage, body: { text: '' }, interrupted: true }]
    renderThread()
    expect(screen.getByText('You stopped it before it answered.')).toBeTruthy()
  })
})
