// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

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
    view: baseView, viewError: null, loaded: true, messages: [], waiting: [], hasMore: false, loadingOlder: false,
    loadOlder: vi.fn(), stream: null, running: false, actionError: null, clearError: vi.fn(), sending: false,
    send: vi.fn(), stop: stopFn, sendNow: vi.fn(), cancelWaiting: vi.fn(), switchAccess: switchFn,
    activityRows: [], activityLoaded: true, liveLines: {}, answering: false, answerApproval: vi.fn(), stopOperation: stopOpFn,
  }
})
afterEach(cleanup)

const renderThread = () => render(<MemoryRouter><ConversationThread conversationId="c1" listPath="/chat" /></MemoryRouter>)

describe('a conversation on screen @SC-1004', () => {
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
    expect(screen.getByTestId('live-line').textContent).toContain('Kernel is writing')
  })

  it('has no message box on a closed conversation, only why and a way to start a new one with the agent @SC-943', () => {
    h.thread.view = { ...baseView, status: 'CLOSED', closedReason: 'PROJECT_DELETED' }
    renderThread()
    expect(screen.queryByLabelText('Message Kernel…')).toBeNull()
    expect(screen.getByTestId('closed-notice').textContent).toContain('its project was deleted')
    const link = screen.getByRole('link', { name: /Start a new conversation with this agent/ })
    expect(link.getAttribute('href')).toBe('/chat?agent=a1')
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
    expect(screen.getByText('The organisation\'s key was removed.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to your own key' }))
    expect(switchFn).toHaveBeenCalledTimes(1)
  })

  it('says a conversation that cannot be answered in one line in the box\'s place, not a band beside it @SC-952', () => {
    h.thread.view = { ...baseView, accessProblem: 'No model provider is working. An organisation admin can add one, or fix the one there is, under Manage organisation › Providers.' }
    renderThread()
    expect(screen.getByTestId('access-line').textContent).toContain('No model provider is working.')
    expect(screen.getByTestId('access-line').textContent).toContain('An administrator has been told.')
    expect(screen.queryByLabelText('Message Kernel…')).toBeNull()
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
    expect(h.thread.send).toHaveBeenCalledWith('Summarise it')
  })

  it('shows the reason of a refused action @SC-1012', () => {
    h.thread.actionError = 'This conversation is closed.'
    renderThread()
    expect(screen.getByRole('alert').textContent).toContain('This conversation is closed.')
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
    expect(screen.getByRole('alert').textContent).toContain('Could not summarise just now.')
  })

  it('says why when Summarise now is refused @SC-983', async () => {
    h.summarise.mockRejectedValue(new Error('There is nothing to summarise yet'))
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Summarise now/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('There is nothing to summarise yet')
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
    expect(start).toHaveBeenCalledWith('c1', { id: 'a1', name: 'Kernel', avatarUrl: null })
  })

  it('shows mute and End beside the pill in voice mode, with the glow behind the thread @SC-994', () => {
    h.voice.voice = voiceOn()
    renderThread()
    expect(screen.getByTestId('voice-controls')).toBeTruthy()
    expect(screen.getByTestId('voice-glow').getAttribute('data-speaker')).toBe('listening')
    expect(screen.getByTestId('message-pill').getAttribute('data-speaker')).toBe('listening')
  })

  it('does not treat another conversation’s voice as voice here @SC-1001', () => {
    h.voice.voice = voiceOn({ conversationId: 'other' })
    renderThread()
    expect(screen.queryByTestId('voice-controls')).toBeNull()
    expect(screen.queryByTestId('voice-glow')).toBeNull()
  })

  it('shows what the person is saying before it is sent @SC-995', () => {
    h.voice.voice = voiceOn({ partial: 'book the meeting' })
    renderThread()
    expect(screen.getByTestId('listening-bubble').textContent).toContain('book the meeting')
    expect(screen.getByTestId('voice-glow').getAttribute('data-speaker')).toBe('person')
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
    expect(screen.getByTestId('voice-controls')).toBeTruthy()
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

  it('shows a streaming reply only as far as it has been heard @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'speaking' })
    h.voice.revealLimit = (turnId: string | undefined, text: string) => (turnId === 't1' ? text.indexOf(' you') : null)
    h.thread.running = true
    h.thread.stream = { turnId: 't1', text: 'Here you go. Then more.' }
    renderThread()
    expect(screen.getByTestId('streaming-reply').textContent).toBe('Here')
  })

  it('shows nothing of a reply, only its pill, before its first words are heard @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'speaking' })
    h.voice.revealLimit = () => 0
    h.thread.running = true
    h.thread.stream = { turnId: 't1', text: 'Here you go.' }
    renderThread()
    expect(screen.queryByTestId('streaming-reply')).toBeNull()
    expect(screen.getByTestId('thinking-pill')).toBeTruthy()
  })

  it('holds back the committed reply too while it is still being spoken @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'speaking' })
    h.voice.revealLimit = (turnId: string | undefined) => (turnId === 't1' ? 0 : null)
    h.thread.messages = [{ ...agentMessage, body: { text: 'Done.' } }]
    renderThread()
    expect(screen.queryByText('Done.')).toBeNull()
  })

  it('keeps a finished reply’s name line, still thinking, until its voice starts @SC-995', () => {
    h.voice.voice = voiceOn({ phase: 'thinking' })
    h.voice.revealLimit = (turnId: string | undefined) => (turnId === 't1' ? 0 : null)
    h.thread.messages = [{ ...agentMessage, body: { text: 'Done.' } }]
    renderThread()
    expect(screen.getByTestId('thinking-pill').textContent).toBe('Thinking›')
    expect(screen.queryByText('Done.')).toBeNull()
  })

  it('greys the voice button with the reason, and says it on a tap @SC-994', () => {
    h.thread.view = { ...baseView, voice: { available: false, unavailableReason: 'Kernel has no voice.', holderId: null, startedAt: null } }
    renderThread()
    const button = screen.getByRole('button', { name: /Start voice/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('title')).toBe('Kernel has no voice.')
    fireEvent.click(button)
    expect(screen.getByTestId('voice-reason').textContent).toBe('Kernel has no voice.')
    expect(h.voice.start).not.toHaveBeenCalled()
  })

  it('greys it on a page that is not secure, saying voice needs https or this computer', () => {
    h.securePage = false
    h.thread.view = { ...baseView, voice: { available: true, unavailableReason: null, holderId: null, startedAt: null } }
    renderThread()
    const button = screen.getByRole('button', { name: /Start voice/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(screen.getByTestId('voice-reason').textContent).toMatch(/need a secure page: open HQ over https, or on this computer at localhost/)
    expect(h.voice.start).not.toHaveBeenCalled()
  })

  it('greys it when someone else holds voice here @SC-994', () => {
    h.thread.view = { ...baseView, voice: { available: true, unavailableReason: null, holderId: 'someone-else', startedAt: '2026-10-16T10:00:00.000Z' } }
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: /Start voice/ }))
    expect(screen.getByTestId('voice-reason').textContent).toContain('Someone else is using voice')
  })

  it('stops the reply being spoken before it stops the turn @SC-997', () => {
    h.voice.voice = voiceOn({ phase: 'speaking' })
    const stopSpeaking = vi.fn(() => true)
    h.voice.stopSpeaking = stopSpeaking
    h.thread.running = true
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stopSpeaking).toHaveBeenCalled()
    expect(stopFn).not.toHaveBeenCalled()
  })

  it('shows the silence warning and the line about why voice ended @SC-1000', () => {
    h.voice.voice = voiceOn({ warningEndsAt: Date.now() + 15000 })
    renderThread()
    expect(screen.getByTestId('voice-silence-warning')).toBeTruthy()
    cleanup()
    h.voice.voice = { ...voiceOff, notice: 'Voice ended after two quiet minutes.', noticeFor: 'c1' }
    renderThread()
    expect(screen.getByTestId('voice-notice').textContent).toContain('Voice ended after two quiet minutes.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(h.voice.clearNotice).toHaveBeenCalled()
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
