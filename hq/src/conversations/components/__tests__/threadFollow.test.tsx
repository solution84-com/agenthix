// @vitest-environment jsdom
/**
 * What the thread follows, laid out by hand (jsdom lays nothing out): the thread is 500 px high with no box over its
 * foot, so the reading line is 75 px above its foot, and the follow jumps (reduced motion) so each frame lands exactly.
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
import { SCROLL_REST_MS } from '../threadScroll'

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
  it('holds the end of the thread: its last line three lines above the box', () => {
    const { rerender } = render(<Thread />)
    const box = layOut(() => 2000)
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer'), answer(3)]} />)
    runFrames()
    // The last line (2000 − 75 of end space) on the reading line (500 − 75).
    expect(box.scrollTop).toBe(1500)
  })

  it('follows the person’s words as they grow, below a reply still being revealed', () => {
    const { rerender } = render(<Thread />)
    let height = 2000
    const box = layOut(() => height)
    cursors.push(revealing(screen.getByText('The newest answer'), () => 900, box))
    rerender(<Thread listening="book the" />)
    runFrames()
    expect(box.scrollTop).toBe(1500)
    height = 2100
    rerender(<Thread listening="book the meeting for Thursday at ten" />)
    runFrames()
    expect(box.scrollTop).toBe(1600)
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
    expect(box.scrollTop).toBe(1200 - 425)
    // Talked over: the words shown ahead of the voice go, and the revealed line is back on the line above.
    line = 1175
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer')]} />)
    runFrames()
    expect(box.scrollTop).toBe(1200 - 425)
  })
})

describe('the person’s own scrolling @SC-1917 @SC-1918', () => {
  it('is never fought: the follow waits until it has rested, then eases back from there', () => {
    const { rerender } = render(<Thread />)
    const box = layOut(() => 2000)
    cursors.push(revealing(screen.getByText('The newest answer'), () => 1200, box))
    rerender(<Thread messages={[answer(1), answer(2, 'The newest answer.')]} />)
    runFrames()
    expect(box.scrollTop).toBe(775)
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
    expect(box.scrollTop).toBe(775)
  })

  it('comes back to following only once a scroll down to the line has rested', () => {
    render(<Thread />)
    const box = layOut(() => 2000)
    box.scrollTop = 1500
    act(() => { fireEvent.wheel(box, { deltaY: -40 }) })
    box.scrollTop = 1000
    act(() => { fireEvent.scroll(box) })
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
    box.scrollTop = 1450
    act(() => { fireEvent.scroll(box) })
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(SCROLL_REST_MS) })
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })
})
