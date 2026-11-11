// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

const h = vi.hoisted(() => ({ copy: vi.fn(), facts: { data: undefined as unknown, error: null as unknown, isLoading: false, refetch: vi.fn() } }))
vi.mock('../../../shared/copyText', () => ({ copyText: (...a: unknown[]) => h.copy(...a) }))
vi.mock('wasp/client/operations', () => ({ getAnswerFacts: 'getAnswerFacts', useQuery: () => h.facts, useAction: () => vi.fn() }))
vi.mock('../ListenButton', () => ({ ANSWER_ICON: '', ListenButton: () => null }))

import { ReplyActions } from '../ReplyActions'
import { ThreadNudgesContext, type ThreadNudge } from '../../hooks/useThreadNudges'

afterEach(() => { cleanup(); h.copy.mockReset(); h.facts.error = null })

describe('Try again on a copy that failed @SC-1004 @SC-1933', () => {
  it('says the second failure in the thread again, after the line was cleared for the retry', async () => {
    h.copy.mockResolvedValue(false)
    const pushed: ThreadNudge[] = []
    const cleared: string[] = []
    render(
      <ThreadNudgesContext.Provider value={{ push: (n) => pushed.push(n), clear: (k) => cleared.push(k) }}>
        <ReplyActions text="The answer" />
      </ThreadNudgesContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(pushed).toHaveLength(1))
    // The thread clears the line, then presses Try again.
    cleared.length = 0
    act(() => { pushed[0]!.retry!() })
    await waitFor(() => expect(pushed).toHaveLength(2))
    expect(pushed[1]!.text).toContain('Could not copy')
  })
})

describe('the answer menu\'s look-up that failed, with the frame line showing', () => {
  it('is held back', () => {
    h.facts.error = new Error('Network Error')
    render(<ReadNudgesHeld.Provider value><ReplyActions text="x" conversationId="c1" turnId="t1" /></ReadNudgesHeld.Provider>)
    fireEvent.click(screen.getByRole('button', { name: 'More about this answer' }))
    expect(screen.queryByText('Could not look it up just now.')).toBeNull()
  })

  it('is said with Try again otherwise', () => {
    h.facts.error = new Error('Network Error')
    render(<ReplyActions text="x" conversationId="c1" turnId="t1" />)
    fireEvent.click(screen.getByRole('button', { name: 'More about this answer' }))
    expect(screen.getByText('Could not look it up just now.')).toBeTruthy()
  })
})
