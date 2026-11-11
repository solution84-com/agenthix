// @vitest-environment jsdom
/** A request for the person's okay in a conversation (conversation spec, Approvals): the card in the thread, and the strip. */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { formatTime } from '@agenthix/ui/sessions'

const h = vi.hoisted(() => ({ thread: {} as Record<string, unknown> }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: { on: () => {}, off: () => {}, emit: () => {} } }) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined, error: null, isLoading: true }),
  // The box's photos and files: kept through these, and the model's list read for which models see images.
  useAction: () => vi.fn(),
  shareConversationFile: 'shareConversationFile',
  setConversationModel: 'setConversationModel',
  getModelChoices: 'getModelChoices',
  getConversationDeletePreview: 'getConversationDeletePreview',
  deleteConversation: vi.fn(),
  summariseConversationNow: vi.fn(),
  setConversationKeep: vi.fn(),
  getOperationResult: 'getOperationResult',
  getConversationPlaces: 'getConversationPlaces',
  getAssetRequestChange: 'getAssetRequestChange',
  getReplyVoice: 'getReplyVoice', getAnswerFacts: 'getAnswerFacts', speakAnswer: vi.fn(),
}))
vi.mock('../../../shared/providers/VoiceCallProvider', () => ({
  useVoiceCall: () => ({
    voice: { conversationId: null, phase: 'off', partial: '' }, start: vi.fn(), end: vi.fn(), toggleMute: vi.fn(),
    stopSpeaking: () => false, clearNotice: vi.fn(), revealLimit: () => null,
  }),
}))
vi.mock('../../hooks/useConversationWorkflowRuns', () => ({ useConversationWorkflowRuns: () => [] }))
vi.mock('../../hooks/useConversationThread', () => ({ useConversationThread: () => h.thread }))
vi.mock('../../../agents/profile/AgentProfileCard', () => ({ AgentProfileTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))
vi.mock('../ConversationPlaces', () => ({ ConversationPlaces: () => null }))
vi.mock('../ConversationModelPicker', () => ({ ConversationModelPicker: () => null }))

import { ConversationThread } from '../ConversationThread'

const agent = { id: 'a1', name: 'Writer', handle: 'writer', avatarUrl: null }
const view = {
  id: 'c1', home: 'PERSON', projectId: null, taskId: null, title: 'Design team', status: 'ACTIVE', closedReason: null, agent,
  lastMessageAt: '2026-11-05T18:30:00.000Z', openedById: 'u1', talkingModel: null, activeTurnId: null, waiting: [],
  accessProblem: null, accessOffer: null, canSpeak: true, voice: { available: false, unavailableReason: null, holderId: null, startedAt: null },
  people: [{ id: 'u1', name: 'Sam', avatarUrl: null }, { id: 'u2', name: 'Avery', avatarUrl: null }], keep: false,
}
const base = { id: '', clientMessageId: null, agentId: null, spoken: false, interrupted: false, withdrawn: false, encouragement: false, queueState: null }
const person = { ...base, id: 'm1', seq: 1, role: 'PERSON', authorId: 'u1', kind: 'TEXT', body: { text: 'Set up a design team' }, operationId: null, turnId: 't1', createdAt: '2026-11-05T18:30:00.000Z' }
const request = {
  ...base, id: 'm2', seq: 2, role: 'PLATFORM', authorId: null, kind: 'APPROVAL_REQUEST', operationId: 'o1', turnId: null, createdAt: '2026-11-05T18:30:05.000Z',
  body: { title: 'Create team', what: 'Create team (name: "Design")', reason: 'To review the relaunch', askedBy: 'Writer', boundaryName: 'Website relaunch' },
}
const words = { ...base, id: 'm3', seq: 3, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: 'I have asked for your okay.' }, operationId: null, turnId: 't1', createdAt: '2026-11-05T18:30:06.000Z' }
const ANSWERED_AT = '2026-11-05T18:31:00.000Z'
const answer = (by: string, a: 'approve' | 'decline') => ({
  ...base, id: 'm4', seq: 4, role: 'PERSON', authorId: by, kind: 'APPROVAL_ANSWER', body: { answer: a }, operationId: 'o1', turnId: 't1', createdAt: ANSWERED_AT,
})
const waitingRow = {
  operationId: 'o1', kind: 'TOOL', title: 'Create team', state: 'WAITING_FOR_APPROVAL', word: 'waiting', boundaryName: 'Website relaunch',
  lines: [], endedHelpers: 0, canStop: true, createdAt: '2026-11-05T18:30:05.000Z',
  request: { what: 'Create team (name: "Design")', reason: 'To review the relaunch', askedBy: 'Writer' },
}
const answerFn = vi.fn()

beforeEach(() => {
  answerFn.mockReset()
  h.thread = {
    view, viewQuery: { data: undefined, error: null, dataUpdatedAt: 0, refetch: vi.fn() }, loaded: true, messages: [person, request, words], waiting: [], hasMore: false, loadingOlder: false,
    loadOlder: vi.fn(), stream: null, running: false, nudges: { nudges: [], push: vi.fn(), clear: vi.fn() }, sendError: null, sendAgain: vi.fn(), refetchView: vi.fn(), sending: false,
    send: vi.fn(), stop: vi.fn(), sendNow: vi.fn(), cancelWaiting: vi.fn(), switchAccess: vi.fn(),
    activityRows: [waitingRow], activityLoaded: true, liveLines: {}, answering: false, answerApproval: answerFn, stopOperation: vi.fn(),
  }
})
afterEach(cleanup)

const renderThread = () => render(<MemoryRouter><ConversationThread conversationId="c1" listPath="/chat" /></MemoryRouter>)

describe("the lead's request at Ask, in the conversation @SC-959 @SC-1933", () => {
  it('is a card in the thread where it was asked, in plain words, and Approve answers it', () => {
    renderThread()
    const card = screen.getByTestId('approval-card')
    expect(screen.getByTestId('thread-messages').contains(card)).toBe(true)
    expect(within(card).getByText('Writer asks to create team')).toBeTruthy()
    expect(card.textContent).toContain('name: "Design"')
    expect(card.textContent).toContain('To review the relaunch')
    expect(card.textContent).toContain('Only this, once')
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(answerFn).toHaveBeenCalledWith('o1', 'approve', undefined)
  })

  it('is denied with an optional reason', () => {
    renderThread()
    const card = screen.getByTestId('approval-card')
    fireEvent.click(within(card).getByRole('button', { name: 'Deny' }))
    fireEvent.change(within(card).getByLabelText('Why you deny it'), { target: { value: ' Not yet ' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Deny' }))
    expect(answerFn).toHaveBeenCalledWith('o1', 'decline', 'Not yet')
  })

  it('keeps a strip above the message box until it is answered, and Show brings the card into view', () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    renderThread()
    const strip = screen.getByTestId('waiting-strip')
    expect(strip.textContent).toContain('Writer is waiting for you: create team')
    fireEvent.click(within(strip).getByRole('button', { name: 'Show' }))
    expect(scrolled).toHaveBeenCalledTimes(1)
    expect(scrolled.mock.contexts[0]).toBe(screen.getByTestId('approval-card').parentElement)
  })

  it('once answered: the buttons and the strip go, and the card says the outcome in place', () => {
    h.thread.messages = [person, request, words, answer('u1', 'approve')]
    h.thread.activityRows = []
    renderThread()
    const card = screen.getByTestId('approval-card')
    expect(within(card).getByText('Writer asked to create team')).toBeTruthy()
    expect(within(card).getByTestId('request-outcome').textContent).toBe(`✓ You approved it · ${formatTime(ANSWERED_AT)}`)
    expect(within(card).queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('waiting-strip')).toBeNull()
  })

  it("names the person who answered when it was someone else, and says denied", () => {
    h.thread.messages = [person, request, words, answer('u2', 'decline')]
    h.thread.activityRows = []
    renderThread()
    expect(screen.getByTestId('request-outcome').textContent).toBe(`✕ Avery denied it · ${formatTime(ANSWERED_AT)}`)
  })

  it('says it no longer waits when it ended unanswered, and claims nothing before the live work is read', () => {
    h.thread.activityRows = []
    h.thread.activityLoaded = false
    const { unmount } = renderThread()
    expect(screen.queryByTestId('request-outcome')).toBeNull()
    expect(within(screen.getByTestId('approval-card')).queryByRole('button')).toBeNull()
    unmount()
    h.thread.activityLoaded = true
    renderThread()
    expect(screen.getByTestId('request-outcome').textContent).toBe('No longer waiting for an answer')
  })
})

describe('only someone who may answer is offered to @SC-959', () => {
  it('shows a reader who may not write the request without buttons or strip', () => {
    h.thread.view = { ...view, canSpeak: false }
    renderThread()
    const card = screen.getByTestId('approval-card')
    expect(within(card).queryByRole('button')).toBeNull()
    expect(card.textContent).toContain('Waiting for someone who can write here to answer')
    expect(screen.queryByTestId('waiting-strip')).toBeNull()
  })

  it('offers a workflow, merge or package request only to those its own check allows', () => {
    h.thread.activityRows = [{ ...waitingRow, mergeCard: { workspaceId: 'w1', branch: 'feature', main: 'main', agentName: 'Writer', canAnswer: false } }]
    renderThread()
    const card = screen.getByTestId('approval-card')
    expect(within(card).queryByRole('button', { name: 'Merge' })).toBeNull()
    expect(card.textContent).toContain('Waiting for a Member or Admin of this project to answer')
    expect(screen.queryByTestId('waiting-strip')).toBeNull()
  })

  it('answers a merge request with Merge and Not now, for one who may merge', () => {
    h.thread.activityRows = [{ ...waitingRow, mergeCard: { workspaceId: 'w1', branch: 'feature', main: 'main', agentName: 'Writer', canAnswer: true } }]
    renderThread()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(answerFn).toHaveBeenCalledWith('o1', 'decline', undefined)
    expect(screen.getByRole('link', { name: 'Open in the workspace' })).toBeTruthy()
  })

  it("draws a workflow version's card with its review, and Review all of it in place of Deny", () => {
    const workflowCard = {
      workflowId: 'w1', workflow: 'deploy-staging', version: 2, hash: 'a'.repeat(64), summary: 'Since version 1: changes step 1.',
      reviewLevel: 'low' as const, flags: [{ rule: 9, high: true, message: 'This step runs code the agent can change' }], mayApprove: false,
      reason: 'Step 2 newly gets KEY.', canAnswer: true,
    }
    h.thread.activityRows = [{ ...waitingRow, workflowCard }]
    renderThread()
    expect(screen.getByTestId('workflow-card-review').textContent).toContain('Low risk')
    expect(screen.getByTestId('workflow-card-flags').textContent).toContain('High: This step runs code')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByTestId('workflow-card-reason').textContent).toBe('Step 2 newly gets KEY.')
    expect(screen.getByRole('link', { name: 'Review all of it' }).getAttribute('href')).toBe('/workflows/w1/versions/2')
  })
})
