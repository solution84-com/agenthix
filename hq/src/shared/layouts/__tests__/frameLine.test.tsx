// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ReadFailure, ReadNudgesHeld } from '@agenthix/ui/attention'

const state = vi.hoisted(() => ({ connected: true, probe: { data: { readOnly: false } as unknown, dataUpdatedAt: 0, errorUpdatedAt: 0 } }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: null, isConnected: state.connected }) }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => state.probe, getHqReadOnly: 'getHqReadOnly' }))

import { NOT_ANSWERING_AFTER_MS, notAnswering, useFrameLine } from '../useFrameLine'
import { HQ_NOT_ANSWERING } from '../shellNoticeWords'
import { ShellNotices } from '../ShellNotices'

function Frame() {
  const frame = useFrameLine()
  return (
    <ReadNudgesHeld.Provider value={frame.holdReadNudges}>
      <output data-testid="line">{frame.words ?? ''}</output>
      <ReadFailure what="The providers" retry={() => {}} />
    </ReadNudgesHeld.Provider>
  )
}

beforeEach(() => {
  cleanup()
  state.connected = true
  state.probe = { data: { readOnly: false }, dataUpdatedAt: 0, errorUpdatedAt: 0 }
})
afterEach(() => vi.useRealTimers())

describe('HQ not answering @SC-1932', () => {
  it('needs the connection down for 30 seconds and the last read since then to have failed', () => {
    const down = 1_000
    const failedAfter = { dataUpdatedAt: 500, errorUpdatedAt: 2_000 }
    expect(notAnswering(null, failedAfter, down + NOT_ANSWERING_AFTER_MS)).toBe(false)
    expect(notAnswering(down, failedAfter, down + NOT_ANSWERING_AFTER_MS - 1)).toBe(false)
    expect(notAnswering(down, failedAfter, down + NOT_ANSWERING_AFTER_MS)).toBe(true)
    // A read that came back after the failure: HQ answers, only the live connection is down.
    expect(notAnswering(down, { dataUpdatedAt: 3_000, errorUpdatedAt: 2_000 }, down + NOT_ANSWERING_AFTER_MS)).toBe(false)
    // The last failure was before the connection went down.
    expect(notAnswering(down, { dataUpdatedAt: 0, errorUpdatedAt: 500 }, down + NOT_ANSWERING_AFTER_MS)).toBe(false)
  })

  it('says nothing while connected, and the screens say their own failed reads', () => {
    render(<Frame />)
    expect(screen.getByTestId('line').textContent).toBe('')
    expect(screen.getByText('The providers could not be read')).toBeTruthy()
  })

  it('says HQ is not answering after 30 seconds down with reads failing, and holds the screens\' nudges back', () => {
    vi.useFakeTimers()
    state.connected = false
    state.probe = { data: { readOnly: false }, dataUpdatedAt: 0, errorUpdatedAt: Date.now() + 5_000 }
    render(<Frame />)
    expect(screen.getByTestId('line').textContent).toBe('')
    act(() => { vi.advanceTimersByTime(NOT_ANSWERING_AFTER_MS + 10) })
    expect(screen.getByTestId('line').textContent).toBe(HQ_NOT_ANSWERING)
    expect(screen.queryByText('The providers could not be read')).toBeNull()
  })

  it('comes before read-only: one line at a time', () => {
    vi.useFakeTimers()
    state.connected = false
    state.probe = { data: { readOnly: true, to: null, since: new Date().toISOString() }, dataUpdatedAt: 0, errorUpdatedAt: Date.now() + 5_000 }
    render(<Frame />)
    expect(screen.getByTestId('line').textContent).toMatch(/read-only/)
    act(() => { vi.advanceTimersByTime(NOT_ANSWERING_AFTER_MS + 10) })
    expect(screen.getByTestId('line').textContent).toBe(HQ_NOT_ANSWERING)
  })
})

describe('HQ read-only during a move @SC-934', () => {
  it('is the frame line, not a dialog, and holds nothing back', () => {
    state.probe = { data: { readOnly: true, to: null, since: '2026-10-18T09:00:00Z' }, dataUpdatedAt: 1, errorUpdatedAt: 0 }
    render(<Frame />)
    expect(screen.getByTestId('line').textContent).toMatch(/^HQ is read-only while it moves to a new machine, since \d\d:\d\d/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('The providers could not be read')).toBeTruthy()
  })
})

describe('ShellNotices', () => {
  it('hands the frame its line and draws nothing, never a dialog', () => {
    state.probe = { data: { readOnly: true, to: null, since: '2026-10-18T09:00:00Z' }, dataUpdatedAt: 1, errorUpdatedAt: 0 }
    const onChange = vi.fn()
    const { container } = render(<ShellNotices onChange={onChange} />)
    expect(container.innerHTML).toBe('')
    expect(onChange).toHaveBeenLastCalledWith({ words: expect.stringMatching(/^HQ is read-only/), holdReadNudges: false })
  })
})
