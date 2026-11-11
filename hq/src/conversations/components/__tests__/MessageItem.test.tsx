// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: { own: { kind: 'user', name: 'Your space', level: 'personal' }, added: [], addable: [] } }),
  useAction: () => vi.fn(),
  getUserSettings: 'getUserSettings',
  getConversationPlaces: 'getConversationPlaces',
  addConversationPlace: vi.fn(),
}))

import { MessageItem, PersonBubble } from '../MessageItem'
import { LivePersonBubble } from '../PersonWords'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
function msg(over: Record<string, unknown>): ConversationMessageView {
  return {
    id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT',
    body: { text: 'Hello' }, spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null,
    createdAt: '2026-10-16T10:24:00.000Z', ...over,
  } as ConversationMessageView
}

describe('a message in the thread @SC-1004', () => {
  it('draws the agent\'s text under its name', () => {
    render(<MessageItem message={msg({})} agent={agent} />)
    expect(screen.getByText('Kernel')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('draws a person\'s text as a bubble of theirs', () => {
    render(<MessageItem message={msg({ role: 'PERSON', agentId: null })} agent={agent} />)
    expect(screen.getByTestId('person-message').textContent).toContain('Hello')
  })

  it('draws a failed reply as a card with its reason, after what was written of it', () => {
    render(<MessageItem message={msg({ kind: 'FAILED', body: { reason: 'The model said it is busy. Try again in a minute.', partialText: 'Let me che' } })} agent={agent} />)
    expect(screen.getByText('Let me che')).toBeTruthy()
    expect(screen.getByTestId('failed-card').textContent).toContain('The model said it is busy. Try again in a minute.')
  })

  it('draws a notice as a quiet line', () => {
    render(<MessageItem message={msg({ role: 'PLATFORM', kind: 'NOTICE', body: { text: 'Now using your own key' } })} agent={agent} />)
    expect(screen.getByText('Now using your own key')).toBeTruthy()
    expect(screen.queryByText('Kernel')).toBeNull()
  })
})

describe('a message waiting behind a reply @SC-1008', () => {
  const waiting = msg({ role: 'PERSON', agentId: null, queueState: 'WAITING' }) as Extract<ConversationMessageView, { kind: 'TEXT' }>

  it('says so and offers Send now and Cancel', () => {
    const sendNow = vi.fn()
    const cancel = vi.fn()
    render(<PersonBubble message={waiting} waiting onSendNow={sendNow} onCancel={cancel} />)
    expect(screen.getByText('Waits for the reply to finish')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(sendNow).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('offers nothing on a message that is not waiting', () => {
    render(<PersonBubble message={waiting} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('the lead\'s suggest-a-place card @SC-1440', () => {
  const body = {
    text: 'Add a place to this conversation: Shop',
    toolName: 'suggest_place',
    target: { kind: 'place', id: 'p1', label: 'Shop', params: { level: 'shop', why: 'To set the process up there.' } },
  }
  const work = { conversationId: 'c1', myId: 'u1' }

  it('draws the card, with buttons for the conversation\'s person', () => {
    render(<MessageItem message={msg({ kind: 'ACTION', body })} agent={agent} work={{ ...work, canChangePlaces: true }} />)
    expect(screen.getByText('Add a place to this conversation: Shop')).toBeTruthy()
    expect(screen.getByText('To set the process up there.')).toBeTruthy()
    expect(screen.getByText('Add Shop')).toBeTruthy()
  })

  it('shows no buttons to anyone else', () => {
    render(<MessageItem message={msg({ kind: 'ACTION', body })} agent={agent} work={work} />)
    expect(screen.queryByText('Add Shop')).toBeNull()
    expect(screen.queryByText('Not now')).toBeNull()
  })

  it('draws any other action as its line', () => {
    render(<MessageItem message={msg({ kind: 'ACTION', body: { text: 'Opened the board', toolName: 'open_board' } })} agent={agent} work={work} />)
    expect(screen.queryByTestId('suggest-place-card')).toBeNull()
  })
})

describe('the person\'s words being said in a call @SC-995 @SC-1921', () => {
  it('are drawn as the message they become: the same bubble, byline and place, not an outline', () => {
    const { container: said } = render(<LivePersonBubble text="Hello" since="2026-10-16T10:24:00.000Z" />)
    const { container: sent } = render(<MessageItem message={msg({ role: 'PERSON', agentId: null })} agent={agent} />)
    const shape = (c: HTMLElement) => [...c.querySelectorAll('*')].map((n) => `${n.tagName}.${n.className}`).join(' ')
    expect(shape(said)).toBe(shape(sent))
    expect(said.textContent).toBe(sent.textContent)
    expect(said.querySelector('.border-dashed, .italic')).toBeNull()
  })
})
