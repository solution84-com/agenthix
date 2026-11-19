// @vitest-environment jsdom
/** The person's words being said, drawn as their bubble and kept once sent until their message takes its place. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { LIVE_WORDS_HOLD_MS, sentKey, useLiveWords } from '../useLiveWords'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const words = (initial: { words?: string; sent: string }) =>
  renderHook((p: { words?: string; sent: string }) => useLiveWords(p.words, p.sent), { initialProps: initial })

describe('the words being said @SC-1921', () => {
  it('grow in one bubble, which keeps the time they began', () => {
    const h = words({ words: 'book', sent: '' })
    const since = h.result.current!.since
    h.rerender({ words: 'book the meeting', sent: '' })
    expect(h.result.current).toEqual({ text: 'book the meeting', since })
  })

  it('stay once sent until the message holding them lands, so the bubble becomes it in place', () => {
    const h = words({ words: 'book the meeting', sent: sentKey({ id: 'p1', text: 'Hi' }) })
    h.rerender({ words: '', sent: sentKey({ id: 'p1', text: 'Hi' }) })
    expect(h.result.current?.text).toBe('book the meeting')
    h.rerender({ words: '', sent: sentKey({ id: 'p2', text: 'book the meeting' }) })
    expect(h.result.current).toBeNull()
  })

  it('go when joined to the person\'s last message, which grows', () => {
    const h = words({ words: 'and Thursday', sent: sentKey({ id: 'p1', text: 'Move it' }) })
    h.rerender({ words: '', sent: sentKey({ id: 'p1', text: 'Move it' }) })
    h.rerender({ words: '', sent: sentKey({ id: 'p1', text: 'Move it and Thursday' }) })
    expect(h.result.current).toBeNull()
  })

  it('go after a while if the message never lands, and at once when the call ends', () => {
    const h = words({ words: 'hello', sent: '' })
    h.rerender({ words: '', sent: '' })
    act(() => { vi.advanceTimersByTime(LIVE_WORDS_HOLD_MS) })
    expect(h.result.current).toBeNull()
    h.rerender({ words: 'again', sent: '' })
    h.rerender({ words: undefined, sent: '' })
    expect(h.result.current).toBeNull()
  })

  it('show no second bubble when the message lands while the words are still being said @SC-1921', () => {
    const h = words({ words: 'How are you?', sent: sentKey({ id: 'p0', text: 'Hi' }) })
    h.rerender({ words: 'How are you?', sent: sentKey({ id: 'p1', text: 'How are you?' }) })
    expect(h.result.current).toBeNull()
    h.rerender({ words: '', sent: sentKey({ id: 'p1', text: 'How are you?' }) })
    expect(h.result.current).toBeNull()
  })

  it('show new words said after the message landed as a new bubble', () => {
    const h = words({ words: 'How are you?', sent: 'a' })
    h.rerender({ words: 'How are you?', sent: 'b' })
    expect(h.result.current).toBeNull()
    h.rerender({ words: 'Fine', sent: 'b' })
    expect(h.result.current?.text).toBe('Fine')
  })

  it('still hold the bubble while the message has not landed', () => {
    const h = words({ words: 'How are you?', sent: 'a' })
    h.rerender({ words: 'How are you?', sent: 'a' })
    expect(h.result.current?.text).toBe('How are you?')
  })
})
