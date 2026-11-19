// @vitest-environment jsdom
/**
 * The bubble of lines said while the person's turn is open, as the playground's Transcript and the conversation panel
 * draw it: after the words said before the first line, above those said since, and gone once the turn's own bubble is on
 * screen, which then shows the lines without revealing them again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { PlaygroundEntry } from '../../../shared/voicePlayground'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import type { ReplyView } from '../ReplyBody'
import { Transcript } from '../../voiceClient/playground/Transcript'
import { replyTextOf, spokenReveal, type Heading } from '../../voiceClient/reveal'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const INVITE = '…move the meeting to?'
const SAID = 'I was thinking we could maybe move the meeting to'
const live = (text: string) => ({ text, since: '2026-11-18T00:51:25.000Z' })
const open = (words: number | null = 10): Heading => ({ turnId: null, heard: INVITE, wordsBefore: words })

/** The chat's bubbles in order: who, and their words. */
function order(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-person-words], [data-role="agent"], [data-testid="streaming-reply"], [data-reply-text]')]
    .filter(n => !n.parentElement?.closest('[data-testid="streaming-reply"]'))
    .map(n => `${n.matches('[data-person-words]') ? 'you' : 'agent'}: ${(n.querySelector('p') ?? n).textContent!.replace(/Agent.*$/, '').trim()}`)
}

describe('the playground transcript', () => {
  it('draws the lines after the words said before them, and your new words under them', () => {
    const { container } = render(<Transcript entries={[]} heading={open()} live={live(`${SAID} Tuesday`)} />)
    expect(order(container)).toEqual([`you: ${SAID}`, `agent: ${INVITE}`, 'you: Tuesday'])
  })

  it('draws no bubble of lines once the turn\'s own bubble is there: that bubble has them', () => {
    const entries: PlaygroundEntry[] = [
      { id: 'p', role: 'person', text: SAID, at: 1, turnId: 't9', spoken: true },
      { id: 'a', role: 'agent', text: `${INVITE} I'm here.`, at: 1, turnId: 't9', state: 'COMPLETED' },
    ]
    const heading: Heading = { turnId: 't9', heard: INVITE }
    const { container } = render(<Transcript entries={entries} heading={heading} reveal={() => INVITE.length} settledOf={() => INVITE.length} />)
    expect(order(container)).toEqual([`you: ${SAID}`, `agent: ${INVITE}`])
    // Already shown in the bubble of lines: not revealed again.
    expect(container.querySelector('[data-c]')).toBeNull()
  })

  it('with no lines, as before', () => {
    const { container } = render(<Transcript entries={[]} heading={null} live={live(SAID)} />)
    expect(order(container)).toEqual([`you: ${SAID}`])
  })
})

function Thread({ messages, heading, listening, running = false, stream = null }: {
  messages: ConversationMessageView[]; heading: Heading | null; listening?: string; running?: boolean; stream?: { turnId: string; text: string } | null
}) {
  const reply: ReplyView = {
    inVoice: true, heading, onOpenPart: () => undefined,
    textFor: (turnId, text) => replyTextOf({ reveal: null, heading }, turnId, text),
    limitFor: (turnId, text) => spokenReveal(null, turnId, text, 0, heading)?.layout ?? null,
    targetFor: (turnId, text) => spokenReveal(null, turnId, text, 0, heading)?.target ?? null,
  }
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={stream} running={running} turnId={running ? 't1' : null} agent={agent} hasMore={false}
      loadingOlder={false} onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} reply={reply} listening={listening}
    />
  )
}

const message = (role: 'PERSON' | 'AGENT', text: string, turnId: string): ConversationMessageView => ({
  id: `${role}-${turnId}`, seq: role === 'PERSON' ? 1 : 2, clientMessageId: null, role, authorId: null, agentId: role === 'AGENT' ? 'a1' : null,
  kind: 'TEXT', body: { text }, spoken: true, interrupted: false, withdrawn: false, encouragement: false, operationId: null, turnId,
  queueState: null, createdAt: '2026-11-18T00:51:28.000Z',
} as ConversationMessageView)

describe('the conversation panel', () => {
  it('draws the lines as the agent\'s bubble after the words said before them, and your new words under them', () => {
    const { container } = render(<Thread messages={[]} heading={open()} listening={`${SAID} Tuesday`} />)
    expect(order(container)).toEqual([`you: ${SAID}`, `agent: ${INVITE}`, 'you: Tuesday'])
  })

  it('keeps the bubble in place once your message lands and the reply\'s turn runs: it heads the reply', () => {
    const { container, rerender } = render(<Thread messages={[message('PERSON', SAID, 't1')]} heading={open()} />)
    expect(order(container)).toEqual([`you: ${SAID}`, `agent: ${INVITE}`])
    const bubble = container.querySelector('[data-testid="streaming-reply"]')
    rerender(<Thread messages={[message('PERSON', SAID, 't1')]} heading={{ turnId: 't1', heard: INVITE }} running />)
    expect(order(container)).toEqual([`you: ${SAID}`, `agent: ${INVITE}`])
    // The same element: it became the reply's bubble, with nothing drawn again.
    expect(container.querySelector('[data-testid="streaming-reply"]')).toBe(bubble)
  })

  it('a closed turn\'s message takes the lines\' place: the lines, and the closing line only once it begins', () => {
    const closed = [message('PERSON', SAID, 't9'), message('AGENT', `${INVITE} I'm here.`, 't9')]
    const { container } = render(<Thread messages={closed} heading={{ turnId: 't9', heard: INVITE }} />)
    expect(order(container)).toEqual([`you: ${SAID}`, `agent: ${INVITE}`])
    cleanup()
    const after = render(<Thread messages={closed} heading={{ turnId: 't9', heard: `${INVITE} I'm here.` }} />)
    expect(order(after.container)).toEqual([`you: ${SAID}`, `agent: ${INVITE} I'm here.`])
  })
})
