// @vitest-environment jsdom
/** A reply voice stopped shows only what the person heard of it, during the call and after it, until its record holds the cut. */
import React from 'react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import { setHeardCut } from '../../voiceClient/heardCut'

afterEach(() => { cleanup(); setHeardCut(null) })

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const WHOLE = 'Edda kept the light. She had kept it for years. No ship thanked her.'
const reply = (text: string, interrupted: boolean): ConversationMessageView => ({
  id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text },
  spoken: false, interrupted, operationId: null, turnId: 't1', queueState: null, createdAt: '2026-11-11T10:00:00.000Z',
} as ConversationMessageView)

/** Heard: the first sentence whole, then four of the second's six words. */
function stopAtKeptIt() {
  act(() => setHeardCut({
    turnId: 't1',
    head: { index: 1, elapsed: 0.7, ended: false },
    sentences: [
      { index: 0, textStart: 0, textEnd: 20, words: ['Edda', 'kept', 'the', 'light'], wordStartSecs: [0, 0.2, 0.4, 0.6] },
      { index: 1, textStart: 21, textEnd: 47, words: ['She', 'had', 'kept', 'it', 'for', 'years'], wordStartSecs: [0, 0.2, 0.4, 0.6, 0.8, 1.0] },
    ],
  }))
}

function Thread({ messages, stream = null }: { messages: ConversationMessageView[]; stream?: { turnId: string; text: string } | null }) {
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={stream} running={!!stream} agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}}
    />
  )
}

describe('a reply voice stopped @SC-997', () => {
  it('shows a stored reply only to the last word heard, with no flash of the rest', () => {
    stopAtKeptIt()
    render(<Thread messages={[reply(WHOLE, false)]} />)
    expect(screen.getByText('Edda kept the light. She had kept it')).toBeTruthy()
    expect(screen.queryByText(/No ship/)).toBeNull()
  })

  it('shows a reply still streaming only to the last word heard', () => {
    stopAtKeptIt()
    render(<Thread messages={[]} stream={{ turnId: 't1', text: WHOLE }} />)
    expect(screen.getByText('Edda kept the light. She had kept it')).toBeTruthy()
  })

  it('shows the record as it is once it holds the cut, marked as stopped', () => {
    stopAtKeptIt()
    render(<Thread messages={[reply('Edda kept the light. She had kept it', true)]} />)
    expect(screen.getByText('Edda kept the light. She had kept it')).toBeTruthy()
    expect(screen.getByTestId('stopped-here')).toBeTruthy()
  })

  it('leaves every other reply whole', () => {
    stopAtKeptIt()
    render(<Thread messages={[{ ...reply(WHOLE, false), id: 'm2', turnId: 't2' }]} />)
    expect(screen.getByText(WHOLE)).toBeTruthy()
  })
})
