// @vitest-environment jsdom
/** What can be done with an answer shows only once the answer has been revealed to its end, never while voice is still saying it. */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { ReplyView } from '../ReplyBody'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'

afterEach(() => cleanup())

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const TEXT = 'Edda kept the light. She had kept it for years.'
// Each test's reply is a turn of its own: a reveal left part-way by one test would otherwise carry on into the next.
let turnId = 't0'
beforeEach(() => { turnId = `t${Number(turnId.slice(1)) + 1}` })
const replyIn = (turn: string): ConversationMessageView => ({
  id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: TEXT },
  spoken: false, interrupted: false, operationId: null, turnId: turn, queueState: null, createdAt: '2026-11-11T10:00:00.000Z',
} as ConversationMessageView)

function Thread({ view }: { view: ReplyView }) {
  return (
    <ThreadMessages
      messages={[replyIn(turnId)]} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} reply={view}
    />
  )
}

const voice = (limit: number | null, target: number | null): ReplyView =>
  ({ inVoice: true, limitFor: () => limit, targetFor: () => target, onOpenPart: () => {} })

describe("an answer's actions wait for its end @SC-1008", () => {
  it('are not shown while voice is still revealing the stored reply', () => {
    render(<Thread view={voice(20, 30)} />)
    expect(screen.queryByLabelText('Copy')).toBeNull()
  })

  it('are not shown while the reveal is still heading for the end', () => {
    render(<Thread view={voice(TEXT.length, 30)} />)
    expect(screen.queryByLabelText('Copy')).toBeNull()
  })

  it('show once the whole reply has been revealed', () => {
    render(<Thread view={voice(null, null)} />)
    expect(screen.getByLabelText('Copy')).toBeTruthy()
  })
})

describe("a typed answer's actions wait for its reveal @SC-1923", () => {
  const typed: ReplyView = { inVoice: false, limitFor: () => null, targetFor: () => null, onOpenPart: () => {} }
  let frames: FrameRequestCallback[] = []
  let now = 0
  beforeEach(() => {
    frames = []
    now = 1000
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  const frame = () => act(() => {
    now += 16
    const due = frames
    frames = []
    due.forEach((f) => f(now))
  })

  it('show only once the reply streamed in has been revealed to its end, not when its turn ends', () => {
    const stream = (text: string) => (
      <ThreadMessages
        messages={[]} waiting={[]} stream={{ turnId, text }} running agent={agent} hasMore={false} loadingOlder={false}
        onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} reply={typed}
      />
    )
    const { rerender } = render(stream(TEXT.slice(0, 20)))
    frame()
    rerender(stream(TEXT))
    frame()
    // The turn ends with the reply only partly revealed: its stored message carries the reveal on.
    rerender(<Thread view={typed} />)
    expect(screen.queryByLabelText('Copy')).toBeNull()
    for (let n = 0; n < 200 && !screen.queryByLabelText('Copy'); n++) frame()
    expect(screen.getByLabelText('Copy')).toBeTruthy()
  })
})
