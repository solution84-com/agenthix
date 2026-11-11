// @vitest-environment jsdom
/**
 * Reading a long thread: where the view goes (in voice, the line being revealed three lines above the box, stepped to a
 * line at a time), the room under the last line, letting go and coming back, the round ↓ and its dot; the start mark.
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
import type { StreamState } from '../../hooks/threadState'
import {
  ACTIONS_PX, AT_REST, comesBack, followTarget, heldAim, letsGo, LINE_PX, lineStep, nextRoom, READING_ROOM, stepAt, readingLineAt, releasesRoom,
  replyGap, REST_GAP, roomFor, SCROLL_REST_MS,
} from '../threadScroll'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const answer = (seq: number): ConversationMessageView => ({
  id: `m${seq}`, seq, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: `Answer ${seq}` },
  spoken: false, interrupted: false, operationId: null, turnId: `t${seq}`, queueState: null, createdAt: '2026-10-16T11:15:00.000Z',
} as ConversationMessageView)

function Thread({ messages, hasMore = false, reply, floatingHeight, stream = null }: {
  messages: ConversationMessageView[]; hasMore?: boolean; reply?: ReplyView; floatingHeight?: number; stream?: StreamState | null
}) {
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={stream} running={false} agent={agent} hasMore={hasMore} loadingOlder={false}
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
  it('puts the line being revealed on the reading line: three lines above the box in voice', () => {
    expect(readingLineAt(400, 'voice')).toBe(400 - 3 * LINE_PX)
    expect(followTarget(1200, readingLineAt(400, 'voice'), 5000)).toBe(1200 - (400 - 3 * LINE_PX))
  })

  it('in typed chat, one line above the usual gap: the line its buttons appear into @SC-1923', () => {
    expect(readingLineAt(400, 'typed', ACTIONS_PX)).toBe(400 - REST_GAP - ACTIONS_PX)
    expect(readingLineAt(400, 'typed', 44)).toBe(400 - REST_GAP - 44)
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

  it('keeps the same room at rest in typed chat and in voice; a reply keeps the room of the way it started @SC-1919', () => {
    const view = (inVoice: boolean): ReplyView => ({ inVoice, limitFor: () => null, targetFor: () => null, onOpenPart: () => {} })
    const stream = { turnId: 't2', text: 'Streaming' } as StreamState
    const space = () => screen.getByTestId('thread-end-space').style.paddingBottom
    for (const inVoice of [false, true]) {
      render(<Thread messages={[answer(1)]} reply={view(inVoice)} floatingHeight={120} />)
      expect(space()).toBe(`${roomFor('rest', 120)}px`)
      cleanup()
    }
    const typed = render(<Thread messages={[answer(1)]} reply={view(false)} floatingHeight={120} stream={stream} />)
    expect(space()).toBe(`${120 + REST_GAP + ACTIONS_PX}px`)
    // Voice comes on while it streams: the reply keeps its room, so nothing moves.
    typed.rerender(<Thread messages={[answer(1)]} reply={view(true)} floatingHeight={120} stream={stream} />)
    expect(space()).toBe(`${120 + REST_GAP + ACTIONS_PX}px`)
    cleanup()
    render(<Thread messages={[answer(1)]} reply={view(true)} floatingHeight={120} stream={stream} />)
    expect(space()).toBe(`${120 + READING_ROOM}px`)
  })
})

describe('the room under the last line @SC-1923', () => {
  it('is the usual gap at rest; while a reply is shown, one line and the gap in typed chat, the reading lines in voice', () => {
    expect(replyGap('typed', ACTIONS_PX)).toBe(REST_GAP + ACTIONS_PX)
    expect(replyGap('voice', ACTIONS_PX)).toBe(READING_ROOM)
    expect(roomFor('rest', 120)).toBe(120 + REST_GAP)
    expect(roomFor('reply', 120, 0, replyGap('typed'))).toBe(120 + REST_GAP + ACTIONS_PX)
    expect(roomFor('reply', 120, 0, READING_ROOM)).toBe(120 + READING_ROOM)
  })

  it('after a reply, keeps what its buttons left: nothing in typed chat, the rest of the reading lines in voice', () => {
    expect(roomFor('after', 120, ACTIONS_PX, replyGap('typed'))).toBe(120 + REST_GAP)
    expect(roomFor('after', 120, 32, READING_ROOM)).toBe(120 + READING_ROOM - 32)
    // Never less than the usual gap.
    expect(roomFor('after', 120, 70, READING_ROOM)).toBe(120 + REST_GAP)
    expect(roomFor('after', 120, -10, READING_ROOM)).toBe(120 + READING_ROOM)
  })

  it('comes with a reply, gives up only what comes under its last line once it ends, and only shrinks', () => {
    const replying = nextRoom(AT_REST, { active: true, hidden: false, line: 1000, voice: true })
    expect(replying).toEqual({ phase: 'reply', kind: 'voice', gap: READING_ROOM, anchor: 1000 })
    const ended = nextRoom(replying, { active: false, hidden: false, line: 1040 })
    expect(ended).toEqual({ phase: 'after', kind: 'voice', gap: READING_ROOM - 40, anchor: 1000 })
    // Something taken away under it gives nothing back.
    expect(nextRoom(ended, { active: false, hidden: false, line: 1010 }).gap).toBe(READING_ROOM - 40)
    expect(nextRoom(ended, { active: false, hidden: false, line: 1050 }).gap).toBe(READING_ROOM - 50)
    // Sending again, from what is left: the room of the way the new reply starts.
    expect(nextRoom(ended, { active: true, hidden: false, line: 1100, voice: false }))
      .toEqual({ phase: 'reply', kind: 'typed', gap: REST_GAP + ACTIONS_PX, anchor: 1100 })
    // Not shown: back at rest.
    expect(nextRoom(ended, { active: false, hidden: true, line: 1040 })).toEqual(AT_REST)
  })

  it('keeps the way a reply started until it ends, so switching between typed chat and voice moves nothing @SC-1919', () => {
    const typed = nextRoom(AT_REST, { active: true, hidden: false, line: 1000, voice: false })
    expect(nextRoom(typed, { active: true, hidden: false, line: 1025, voice: true }))
      .toEqual({ phase: 'reply', kind: 'typed', gap: REST_GAP + ACTIONS_PX, anchor: 1025 })
  })

  it('gives a typed reply’s line to its buttons when it ends, leaving the usual gap', () => {
    const typed = nextRoom(AT_REST, { active: true, hidden: false, line: 1000, voice: false, actions: 44 })
    expect(typed.gap).toBe(REST_GAP + 44)
    expect(nextRoom(typed, { active: false, hidden: false, line: 1044, actions: 44 }).gap).toBe(REST_GAP)
  })

  it('lets what is left go only once it is out of sight', () => {
    const left = { phase: 'after' as const, kind: 'voice' as const, gap: REST_GAP + 23, anchor: 0 }
    expect(releasesRoom(left, 1500, 1500)).toBe(false)
    expect(releasesRoom(left, 1500, 1478)).toBe(false)
    expect(releasesRoom(left, 1500, 1477)).toBe(true)
    expect(releasesRoom(AT_REST, 1500, 0)).toBe(false)
    expect(releasesRoom({ phase: 'reply', kind: 'voice', gap: READING_ROOM, anchor: 0 }, 1500, 0)).toBe(false)
  })
})

describe('the step to the next line, in voice @SC-1916', () => {
  it('moves a line in a short step that starts quickly and settles, then holds', () => {
    const step = lineStep(1000, 1025, 0)
    expect(stepAt(step, 0)).toBe(1000)
    expect(stepAt(step, step.ms / 2)).toBeGreaterThan(1000 + 25 * 0.8)
    expect(stepAt(step, step.ms)).toBe(1025)
    expect(stepAt(step, step.ms * 3)).toBe(1025)
  })

  it('takes a little longer over a longer move, the person\u2019s words going to the top', () => {
    expect(lineStep(0, LINE_PX, 0).ms).toBeLessThan(lineStep(0, 10 * LINE_PX, 0).ms)
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
