// @vitest-environment jsdom
/**
 * Reading a long thread: the line being revealed held above the box and followed a line at a time; only the person,
 * scrolling up, lets go; scrolling back down to the line or ↓ follows again; the round ↓ and its dot; the start mark.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import type { ReplyView } from '../ReplyBody'
import { comesBack, endSpaceFor, followTarget, heldAim, letsGo, LINE_PX, readingLineAt, SCROLL_REST_MS } from '../threadScroll'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const answer = (seq: number): ConversationMessageView => ({
  id: `m${seq}`, seq, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: `Answer ${seq}` },
  spoken: false, interrupted: false, operationId: null, turnId: `t${seq}`, queueState: null, createdAt: '2026-10-16T11:15:00.000Z',
} as ConversationMessageView)

function Thread({ messages, hasMore = false, reply, floatingHeight }: { messages: ConversationMessageView[]; hasMore?: boolean; reply?: ReplyView; floatingHeight?: number }) {
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={null} running={false} agent={agent} hasMore={hasMore} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} reply={reply} floatingHeight={floatingHeight}
    />
  )
}

/** Gives the scroller a height, a viewport and a position, as the browser would, then lets it hear the scroll. */
function scrollTo(box: HTMLElement, top: number) {
  Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 500 })
  box.scrollTop = top
  act(() => { fireEvent.scroll(box) })
}
const scrollUp = (box: HTMLElement) => act(() => { fireEvent.wheel(box, { deltaY: -40 }) })

describe('where the thread scrolls to @SC-1916', () => {
  it('puts the bottom of the line being revealed on the reading line, three lines above the box', () => {
    expect(readingLineAt(400)).toBe(400 - 3 * LINE_PX)
    expect(followTarget(1200, readingLineAt(400), 5000)).toBe(1200 - (400 - 3 * LINE_PX))
  })

  it('does not scroll a thread that fits the screen', () => {
    expect(followTarget(200, readingLineAt(400), 300)).toBe(0)
  })

  it('never scrolls past the end', () => {
    expect(followTarget(5000, 300, 1500)).toBe(1500)
  })

  it('holds where the view was when text was taken away under the line, until the line passes it @SC-1919', () => {
    expect(heldAim(700, 775, 1500)).toBe(775)
    expect(heldAim(800, 775, 1500)).toBe(800)
    expect(heldAim(700, null, 1500)).toBe(700)
    // Never past the end, which the content shrinking moves up.
    expect(heldAim(600, 775, 650)).toBe(650)
  })

  it('keeps the same room under the last reply in typed chat and in voice @SC-1919', () => {
    const view = (inVoice: boolean): ReplyView => ({ inVoice, limitFor: () => null, targetFor: () => null, onOpenPart: () => {} })
    const typed = render(<Thread messages={[answer(1)]} reply={view(false)} floatingHeight={120} />)
    const typedSpace = typed.getByTestId('thread-end-space').style.paddingBottom
    typed.unmount()
    render(<Thread messages={[answer(1)]} reply={view(true)} floatingHeight={120} />)
    expect(screen.getByTestId('thread-end-space').style.paddingBottom).toBe(typedSpace)
    expect(typedSpace).toBe(`${endSpaceFor(120)}px`)
  })
})

describe('letting go and coming back @SC-1917', () => {
  it('lets go only on the person scrolling up', () => {
    expect(letsGo({ kind: 'wheel', deltaY: -10 })).toBe(true)
    expect(letsGo({ kind: 'wheel', deltaY: 10 })).toBe(false)
    expect(letsGo({ kind: 'touch' })).toBe(true)
    for (const key of ['ArrowUp', 'PageUp', 'Home']) expect(letsGo({ kind: 'key', key })).toBe(true)
    for (const key of ['ArrowDown', 'PageDown', 'End', 'a']) expect(letsGo({ kind: 'key', key })).toBe(false)
    expect(letsGo({ kind: 'press', onScrollBar: true })).toBe(true)
    expect(letsGo({ kind: 'press', onScrollBar: false })).toBe(false)
  })

  it('comes back when the person scrolls down until the line is in view, even behind the box', () => {
    const at = { lastTop: 600, lastSet: NaN, lineBottom: 1100, viewHeight: 500 }
    expect(comesBack({ ...at, top: 650 })).toBe(true)
    // Still above the line: the line is below the view.
    expect(comesBack({ ...at, top: 590, lastTop: 500 })).toBe(false)
    // Scrolling up never comes back.
    expect(comesBack({ ...at, top: 620, lastTop: 700 })).toBe(false)
    // The follow's own scrolling is not the person's.
    expect(comesBack({ ...at, top: 650, lastSet: 650 })).toBe(false)
  })
})

describe('the round ↓ above the box @SC-1005 @SC-1917', () => {
  it('is not there while following', () => {
    render(<Thread messages={[answer(1)]} />)
    scrollTo(screen.getByTestId('thread-messages'), 1500)
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })

  it('does not show when the thread scrolls by itself', () => {
    render(<Thread messages={[answer(1)]} />)
    scrollTo(screen.getByTestId('thread-messages'), 200)
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })

  it('shows once the person scrolls up, with no dot, and follows again when pressed', () => {
    render(<Thread messages={[answer(1)]} />)
    const box = screen.getByTestId('thread-messages')
    scrollUp(box)
    const jump = screen.getByRole('button', { name: 'Jump to the latest' })
    expect(screen.queryByTestId('jump-dot')).toBeNull()
    fireEvent.click(jump)
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })

  it('stays away on scrolling down short of the line, and follows again on reaching it once the scroll rests', () => {
    vi.useFakeTimers()
    try {
      render(<Thread messages={[answer(1)]} />)
      const box = screen.getByTestId('thread-messages')
      scrollTo(box, 1000)
      scrollUp(box)
      scrollTo(box, 200)
      expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
      // The last line is in view (jsdom lays nothing out, so it is always in view once scrolling down).
      scrollTo(box, 400)
      expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(SCROLL_REST_MS) })
      expect(screen.queryByTestId('jump-to-latest')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a dot once a new answer has arrived while let go, and drops it on following again', () => {
    const { rerender } = render(<Thread messages={[answer(1)]} />)
    const box = screen.getByTestId('thread-messages')
    scrollUp(box)
    rerender(<Thread messages={[answer(1), answer(2)]} />)
    expect(screen.getByTestId('jump-dot')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Jump to the latest, a new answer has arrived' }))
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
    scrollUp(box)
    expect(screen.queryByTestId('jump-dot')).toBeNull()
  })

  it('shows no dot for an answer that arrived while following', () => {
    const { rerender } = render(<Thread messages={[answer(1)]} />)
    const box = screen.getByTestId('thread-messages')
    rerender(<Thread messages={[answer(1), answer(2)]} />)
    scrollUp(box)
    expect(screen.queryByTestId('jump-dot')).toBeNull()
  })
})

describe('the start of the conversation @SC-1005', () => {
  it('is marked once nothing earlier is left to load', () => {
    render(<Thread messages={[answer(1)]} />)
    expect(screen.getByTestId('conversation-start').textContent).toBe('Start of the conversation')
  })

  it('is not marked while earlier messages wait', () => {
    render(<Thread messages={[answer(5)]} hasMore />)
    expect(screen.queryByTestId('conversation-start')).toBeNull()
  })
})
