// @vitest-environment jsdom
/**
 * A reply shows the thread where it is being revealed only while it is: once it is whole and at rest, its cursor goes,
 * however it came to rest. A cursor left behind in an old reply is what the thread followed back up to it.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { ReplyBody } from '../../../../conversations/components/ReplyBody'
import { cursorIn } from '../cursor'

let frames: FrameRequestCallback[] = []
const runFrames = () => {
  for (let n = 0; n < 50 && frames.length; n++) {
    const due = frames
    frames = []
    act(() => due.forEach((f) => f(performance.now())))
  }
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // Reduced motion: the reveal jumps to its target with no fade, so it comes to rest in one frame.
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('where a reply is being revealed @SC-1916', () => {
  it('is shown while voice reveals the reply', () => {
    const { container } = render(<ReplyBody text="Go on." limit={6} target={6} replyKey="v1" writtenAt="2026-11-11T10:00:00Z" />)
    runFrames()
    expect(cursorIn(container)).not.toBeNull()
  })

  it('goes once voice moves on from a reply it had revealed whole', () => {
    const { container, rerender } = render(<ReplyBody text="Go on." limit={6} target={6} replyKey="v2" writtenAt="2026-11-11T10:00:00Z" />)
    runFrames()
    rerender(<ReplyBody text="Go on." limit={null} target={null} replyKey="v2" writtenAt="2026-11-11T10:00:00Z" />)
    runFrames()
    expect(cursorIn(container)).toBeNull()
  })

  it('goes once a stream that was shown to its end stops streaming', () => {
    const { container, rerender } = render(<ReplyBody text="All done." replyKey="s1" live />)
    runFrames()
    rerender(<ReplyBody text="All done." replyKey="s1" />)
    runFrames()
    expect(cursorIn(container)).toBeNull()
  })
})
