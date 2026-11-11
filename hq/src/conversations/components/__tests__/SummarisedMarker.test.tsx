// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => ({
  segment: { data: undefined, error: null, isLoading: true } as Record<string, unknown>,
  page: vi.fn(),
  queried: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getConversationSegment: 'getConversationSegment',
  getConversationMessages: (args: unknown) => h.page(args),
  useQuery: (q: unknown, args: unknown) => { h.queried(q, args); return h.segment },
}))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { MessageItem } from '../MessageItem'

const marker = (body: Record<string, unknown>): ConversationMessageView => ({
  id: 'm9', seq: 9, clientMessageId: null, role: 'PLATFORM', authorId: null, agentId: null, kind: 'SUMMARISED', body,
  spoken: false, interrupted: false, operationId: null, turnId: null, queueState: null, createdAt: '2026-10-16T11:00:00.000Z',
} as ConversationMessageView)
const record = (seq: number, text: string, role = 'PERSON') => ({
  id: `r${seq}`, seq, kind: 'TEXT', role, body: { text }, createdAt: '2026-10-16T10:00:00.000Z',
})
const body = { brief: 'Planned the Q3 budget and settled on 40k', summary: 'unused here', firstSeq: 2, lastSeq: 4, segmentId: 'seg1', ledgerKept: ['Approved the vendor'] }
const work = { conversationId: 'c1', myId: 'u1', activityOf: () => null }

beforeEach(() => {
  h.segment = { data: undefined, error: null, isLoading: true }
  h.page.mockReset()
  h.queried.mockReset()
})
afterEach(cleanup)

describe('the summarised marker @SC-984', () => {
  it('level one: shows the span and the brief, and reads nothing until opened', () => {
    render(<MemoryRouter><MessageItem message={marker(body)} agent={null} work={work} /></MemoryRouter>)
    const text = screen.getByTestId('summarised-marker').textContent ?? ''
    expect(text).toContain('Messages 2 to 4')
    expect(text).toContain('Planned the Q3 budget and settled on 40k')
    expect(h.queried).not.toHaveBeenCalled()
    expect(h.page).not.toHaveBeenCalled()
  })

  it('level two: opening it reads the segment and shows the full summary and what the ledger kept', () => {
    h.segment = { data: { id: 'seg1', firstSeq: 2, lastSeq: 4, summary: 'Decided 40k because of the Q2 overrun.' }, error: null, isLoading: false }
    render(<MemoryRouter><MessageItem message={marker(body)} agent={null} work={work} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(h.queried).toHaveBeenCalledWith('getConversationSegment', { conversationId: 'c1', segmentId: 'seg1' })
    expect(screen.getByTestId('segment-summary').textContent).toBe('Decided 40k because of the Q2 overrun.')
    expect(screen.getByText(/Approved the vendor/)).toBeTruthy()
    expect(h.page).not.toHaveBeenCalled()
  })

  it('level three: from the summary, shows the messages the segment covers and no others', async () => {
    h.segment = { data: { id: 'seg1', firstSeq: 2, lastSeq: 4, summary: 'Decided 40k.' }, error: null, isLoading: false }
    h.page.mockResolvedValue({ messages: [record(4, 'Then 40k.', 'AGENT'), record(3, 'What budget?'), record(2, 'Plan Q3'), record(1, 'Before the span')], hasMore: false })
    render(<MemoryRouter><MessageItem message={marker(body)} agent={null} work={work} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: /Show the 3 messages/ }))
    const list = await screen.findByTestId('segment-messages')
    expect(h.page).toHaveBeenCalledWith({ conversationId: 'c1', beforeSeq: 5 })
    expect(Array.from(list.querySelectorAll('p')).map(p => p.textContent?.replace(/^.*· /, ''))).toEqual(['Plan Q3', 'What budget?', 'Then 40k.'])
  })

  it('says in place of the segment that it cannot be read', () => {
    h.segment = { data: undefined, error: new Error('Segment not found'), isLoading: false }
    render(<MemoryRouter><MessageItem message={marker(body)} agent={null} work={work} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('The summarised messages could not be read')).toBeTruthy()
    expect(screen.getByText('HQ did not answer.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the lead\'s offer of a new conversation @SC-984', () => {
  const offer = {
    id: 'o1', seq: 20, role: 'PLATFORM', kind: 'ACTION', body: { text: 'You could carry on with the website in a new conversation', toolName: 'offer_new_conversation' },
    createdAt: '2026-10-16T12:00:00.000Z', agentId: 'a1', turnId: 't1', queueState: null, interrupted: false, spoken: false, authorId: null, operationId: null, clientMessageId: null,
  } as unknown as ConversationMessageView

  it('is one line with a way to start it', () => {
    render(<MemoryRouter><MessageItem message={offer} agent={null} work={{ ...work, newConversationHref: '/chat?agent=a1' }} /></MemoryRouter>)
    const line = screen.getByTestId('new-conversation-offer')
    expect(line.textContent).toContain('the website in a new conversation')
    expect(line.querySelector('a')?.getAttribute('href')).toBe('/chat?agent=a1')
  })
})
