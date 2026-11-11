// @vitest-environment jsdom
/** What can be done with an answer shows only once the answer has been revealed to its end, never while voice is still saying it. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { ReplyView } from '../ReplyBody'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'

afterEach(() => cleanup())

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const TEXT = 'Edda kept the light. She had kept it for years.'
const reply: ConversationMessageView = {
  id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: TEXT },
  spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null, createdAt: '2026-11-11T10:00:00.000Z',
} as ConversationMessageView

function Thread({ view }: { view: ReplyView }) {
  return (
    <ThreadMessages
      messages={[reply]} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
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
