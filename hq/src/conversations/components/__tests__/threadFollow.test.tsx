// @vitest-environment jsdom
/**
 * What the thread follows, laid out by hand (jsdom lays nothing out): the thread is 500 px high with no box over its
 * foot, so the reading line is 52 px above its foot in typed chat (a reply's buttons and the usual gap) and 75 px in
 * voice, and the follow jumps (reduced motion) so each frame lands exactly. How it moves between frames is measured in a
 * real browser by the thread harness (e2e/harness).
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { hideCursor, showCursor, type RevealCursor } from '../../../shared/components/reveal/cursor'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import { ACTIONS_PX, READING_ROOM, REST_GAP, SCROLL_REST_MS } from '../threadScroll'
import type { ReplyView } from '../ReplyBody'

/** A typed reply's room under its newest line (its buttons and the usual gap), and its reading line in the 500 px view. */
const TYPED_ROOM = REST_GAP + ACTIONS_PX
const TYPED_READING = 500 - TYPED_ROOM

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const answer = (seq: number, text = `Answer ${seq}`): ConversationMessageView => ({
  id: `m${seq}`, seq, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text },
  spoken: false, interrupted: false, operationId: null, turnId: `t${seq}`, queueState: null, createdAt: '2026-11-11T10:00:00.000Z',
} as ConversationMessageView)

function Thread({ listening, messages = [answer(1), answer(2, 'The newest answer')] }: { listening?: string; messages?: ConversationMessageView[] }) {
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} listening={listening}
    />
  )
}

let frames: FrameRequestCallback[] = []
const runFrames = () => {
  for (let n = 0; n < 20 && frames.length; n++) {
    const due = frames
    frames = []
    act(() => due.forEach((f) => f(n * 16)))
  }
}
const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} }) as DOMRect

/** Lays the thread out: its content `height()` px high (end space included), seen through 500 px. */
function layOut(height: () => number) {
  const box = screen.getByTestId('thread-messages')
  const inner = screen.getByTestId('thread-end-space')
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: height })
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 500 })
  box.getBoundingClientRect = () => rect(0, 500)
  inner.getBoundingClientRect = () => rect(-box.scrollTop, height() - box.scrollTop)
  return box
}

/** A reply being revealed, its revealed line ending `bottom()` px down the content. */
function revealing(el: HTMLElement, bottom: () => number, box: HTMLElement): RevealCursor {
  el.getBoundingClientRect = () => rect(bottom() - 25 - box.scrollTop, bottom() - box.scrollTop)
  const c = { element: () => el }
  act(() => showCursor(c))
  return c
}

let cursors: RevealCursor[] = []
beforeEach(() => {
  frames = []
  cursors = []
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cursors.forEach(hideCursor)
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('what the thread follows with no reveal under way @SC-1916', () => {
  it('holds the end of the thread: its last line the usual gap above the box', () => {
    const { rerender } = render(<Thread />)
    const box = layOut(() => 2000)
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer'), answer(3)]} />)
    runFrames()
    // As far down as it goes.
    expect(box.scrollTop).toBe(1500)
  })

  it('does not follow the thread as it grows in typed chat: the person reads at their own pace', () => {
    const { rerender } = render(<Thread />)
    let height = 2000
    const box = layOut(() => height)
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer'), answer(3)]} />)
    runFrames()
    expect(box.scrollTop).toBe(1500)
    height = 2100
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer'), answer(3, 'A longer third answer')]} />)
    runFrames()
    expect(box.scrollTop).toBe(1500)
  })
})

describe('an interruption @SC-1919', () => {
  it('leaves the view where it is when the words revealed ahead are taken away', () => {
    const { rerender } = render(<Thread />)
    let line = 1200
    const box = layOut(() => 2000)
    cursors.push(revealing(screen.getByText('The newest answer'), () => line, box))
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer.')]} />)
    runFrames()
    // The revealed line on the reading line: one line above the usual gap, in typed chat (500 − 52).
    expect(box.scrollTop).toBe(1200 - TYPED_READING)
    // Talked over: the words shown ahead of the voice go, and the revealed line is back on the line above.
    line = 1175
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer')]} />)
    runFrames()
    expect(box.scrollTop).toBe(1200 - TYPED_READING)
  })
})

describe('the person’s own scrolling @SC-1917 @SC-1918', () => {
  it('is never fought: the follow waits until it has rested, and never takes the view back up from where it was left', () => {
    const { rerender } = render(<Thread />)
    const box = layOut(() => 2000)
    let line = 1200
    cursors.push(revealing(screen.getByText('The newest answer'), () => line, box))
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer.')]} />)
    runFrames()
    expect(box.scrollTop).toBe(1200 - TYPED_READING)
    // A fling down: its momentum keeps scrolling.
    for (const top of [900, 1000, 1050]) {
      box.scrollTop = top
      act(() => { fireEvent.scroll(box) })
      runFrames()
      expect(box.scrollTop).toBe(top)
      act(() => { vi.advanceTimersByTime(SCROLL_REST_MS - 50) })
      runFrames()
      expect(box.scrollTop).toBe(top)
    }
    act(() => { vi.advanceTimersByTime(SCROLL_REST_MS) })
    runFrames()
    expect(box.scrollTop).toBe(1050)
    // A typed reply is never followed: the view stays where the person left it as the reveal goes on.
    line = 1600
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer..')]} />)
    runFrames()
    expect(box.scrollTop).toBe(1050)
  })

  it('comes back to following only once a scroll down to the line has rested', () => {
    render(<Thread />)
    const box = layOut(() => 2000)
    box.scrollTop = 1500
    act(() => { fireEvent.wheel(box, { deltaY: -40 }) })
    box.scrollTop = 1000
    act(() => { fireEvent.scroll(box) })
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
    // The last line (2000 − the usual gap) in view.
    box.scrollTop = 1490
    act(() => { fireEvent.scroll(box) })
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(SCROLL_REST_MS) })
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })
})

/** The thread with a turn that may be running, its replies shown as `reply` says (typed chat by default). */
function Turn({ running = false, messages = [answer(1)], reply }: { running?: boolean; messages?: ConversationMessageView[]; reply?: ReplyView }) {
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={null} running={running} agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} reply={reply}
    />
  )
}
const view = (inVoice: boolean, limit: number | null = null): ReplyView => ({ inVoice, limitFor: () => limit, targetFor: () => null, onOpenPart: () => {} })

/** Lays the thread out as the browser would: its content `content()` px high, then the room it keeps under it, seen through 500 px. */
function layOutContent(content: () => number) {
  const inner = screen.getByTestId('thread-end-space')
  return layOut(() => content() + parseFloat(inner.style.paddingBottom || '0'))
}
const room = () => screen.getByTestId('thread-end-space').style.paddingBottom
const ended = [answer(1), answer(2)]
/** What a spoken reply's room keeps once its buttons have taken their share. */
const LEFT = READING_ROOM - ACTIONS_PX

describe('the room under the last line @SC-1923 @SC-1916', () => {
  it('is the usual gap when a conversation opens: its last message sits just above the box', () => {
    const { rerender } = render(<Turn />)
    const box = layOutContent(() => 1980)
    rerender(<Turn messages={ended} />)
    runFrames()
    expect(room()).toBe(`${REST_GAP}px`)
    expect(box.scrollTop).toBe(1500)
  })

  /** A reply running at the foot of the thread, typed or spoken, the person's message having taken the content to 2040 px. */
  function replying(reply?: ReplyView) {
    let content = 1980
    const r = render(<Turn reply={reply} />)
    const box = layOutContent(() => content)
    r.rerender(<Turn messages={[answer(1)]} reply={reply} />)
    runFrames()
    content = 2040
    r.rerender(<Turn running reply={reply} />)
    return { box, rerender: r.rerender, buttons: () => { content = 2040 + ACTIONS_PX } }
  }

  it('keeps one line of room while a typed reply runs, and does not move the view by itself', () => {
    const { box } = replying()
    expect(room()).toBe(`${TYPED_ROOM}px`)
    expect(box.scrollTop).toBe(1500)
    runFrames()
    expect(box.scrollTop).toBe(1500)
  })

  it('gives a typed reply’s line to its buttons when it ends at the foot: the usual gap, and nothing moves, then or later', () => {
    const { box, rerender, buttons } = replying()
    runFrames()
    const [top, height] = [box.scrollTop, box.scrollHeight]
    buttons()
    rerender(<Turn messages={ended} />)
    expect(screen.getAllByRole('button', { name: 'Copy' }).length).toBeGreaterThan(0)
    expect(room()).toBe(`${REST_GAP}px`)
    expect([box.scrollTop, box.scrollHeight]).toEqual([top, height])
    runFrames()
    act(() => { vi.advanceTimersByTime(SCROLL_REST_MS) })
    runFrames()
    expect([box.scrollTop, box.scrollHeight]).toEqual([top, height])
  })

  it('keeps the reading lines for a spoken reply, then gives up exactly what its buttons take, so nothing moves', () => {
    const { box, rerender, buttons } = replying(view(true))
    expect(room()).toBe(`${READING_ROOM}px`)
    runFrames()
    // The end of the content on the reading line (500 − 75).
    expect(box.scrollTop).toBe(2040 - 425)
    const [top, height] = [box.scrollTop, box.scrollHeight]
    buttons()
    rerender(<Turn messages={ended} reply={view(true)} />)
    expect(room()).toBe(`${LEFT}px`)
    expect([box.scrollTop, box.scrollHeight]).toEqual([top, height])
    // At the foot what is left never goes by itself.
    act(() => { vi.advanceTimersByTime(10_000) })
    runFrames()
    expect(room()).toBe(`${LEFT}px`)
    expect(box.scrollTop).toBe(top)
  })

  it('goes back to the usual gap at once when the person had scrolled up, leaving the view where it is', () => {
    const { box, rerender, buttons } = replying(view(true))
    runFrames()
    act(() => { fireEvent.wheel(box, { deltaY: -40 }) })
    box.scrollTop = 1000
    act(() => { fireEvent.scroll(box) })
    buttons()
    rerender(<Turn messages={ended} reply={view(true)} />)
    expect(room()).toBe(`${REST_GAP}px`)
    expect(box.scrollTop).toBe(1000)
  })

  it('lets what is left go once the person scrolls up past it, and not before', () => {
    const { box, rerender, buttons } = replying(view(true))
    runFrames()
    buttons()
    rerender(<Turn messages={ended} reply={view(true)} />)
    const top = box.scrollTop
    act(() => { fireEvent.wheel(box, { deltaY: -10 }) })
    box.scrollTop = top - 10
    act(() => { fireEvent.scroll(box) })
    expect(room()).toBe(`${LEFT}px`)
    box.scrollTop = top - (LEFT - REST_GAP)
    act(() => { fireEvent.scroll(box) })
    expect(room()).toBe(`${REST_GAP}px`)
    expect(box.scrollTop).toBe(top - (LEFT - REST_GAP))
  })

  it('is whole again when the person sends again, with nothing dropping', () => {
    const { box, rerender, buttons } = replying(view(true))
    runFrames()
    buttons()
    rerender(<Turn messages={ended} reply={view(true)} />)
    const top = box.scrollTop
    rerender(<Turn running messages={ended} reply={view(true)} />)
    expect(room()).toBe(`${READING_ROOM}px`)
    expect(box.scrollTop).toBe(top)
  })

  it('does not change between typed chat and voice, during a reply or after it @SC-1919', () => {
    const { box, rerender, buttons } = replying(view(false))
    runFrames()
    const top = box.scrollTop
    rerender(<Turn running reply={view(true)} />)
    rerender(<Turn running reply={view(false)} />)
    rerender(<Turn running reply={view(true)} />)
    expect(room()).toBe(`${TYPED_ROOM}px`)
    expect(box.scrollTop).toBe(top)
    buttons()
    rerender(<Turn messages={ended} reply={view(false)} />)
    rerender(<Turn messages={ended} reply={view(true)} />)
    runFrames()
    expect(room()).toBe(`${REST_GAP}px`)
    expect(box.scrollTop).toBe(top)
  })

  it('stays whole while a reply that has ended waits for its voice', () => {
    const { box, rerender } = replying(view(true))
    runFrames()
    rerender(<Turn messages={ended} reply={view(true, 0)} />)
    expect(room()).toBe(`${READING_ROOM}px`)
    runFrames()
    expect(room()).toBe(`${READING_ROOM}px`)
    expect(box.scrollTop).toBe(2040 - 425)
  })

  it('is back at the usual gap when the thread is shown again after being hidden', () => {
    const { box, rerender, buttons } = replying(view(true))
    runFrames()
    buttons()
    rerender(<Turn messages={ended} reply={view(true)} />)
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 0 })
    rerender(<Turn messages={ended} reply={view(false)} />)
    expect(room()).toBe(`${REST_GAP}px`)
  })
})

describe('the end of the thread while a reply is revealed @SC-1923', () => {
  it('ends the room under the revealed line: what is laid out ahead of the reveal is clipped, never shown as empty space', () => {
    const { rerender } = render(<Thread />)
    const box = layOut(() => 2000)
    const inner = screen.getByTestId('thread-end-space')
    expect(inner.style.maxHeight).toBe('')
    const cursor = revealing(screen.getByText('The newest answer'), () => 1200, box)
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer.')]} />)
    runFrames()
    expect(inner.style.maxHeight).toBe(`${1200 + TYPED_ROOM}px`)
    act(() => hideCursor(cursor))
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer')]} />)
    expect(inner.style.maxHeight).toBe('')
  })
})
