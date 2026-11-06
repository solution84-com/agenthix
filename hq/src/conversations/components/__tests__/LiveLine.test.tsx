// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { LiveLine, liveLineWords } from '../LiveLine'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the line above the message box while the agent works', () => {
  it('says what the run reports now, in words', () => {
    expect(liveLineWords('Writer', { steps: [], writing: false })).toBe('Writer is thinking')
    expect(liveLineWords('Writer', { steps: [{ label: 'Searching Knowledge and 2 more' }], writing: false })).toBe('Writer is searching Knowledge and 2 more')
    expect(liveLineWords('Writer', { steps: [{ label: 'Looked at the boards', ms: 900 }], writing: false })).toBe('Writer is thinking')
    expect(liveLineWords('Writer', { steps: [{ label: 'Looked at the boards', ms: 900 }], writing: true })).toBe('Writer is writing')
    expect(liveLineWords('Writer', { steps: [{ label: 'Looked at the boards', ms: 900 }, { label: 'Creating a task · "Check the footer links"' }], writing: true }))
      .toBe('Writer is creating a task · "Check the footer links"')
  })

  it('says Working for a step with no name, and never counts work it started as running', () => {
    expect(liveLineWords('Writer', { steps: [{ label: '' }], writing: false })).toBe('Writer is working')
    expect(liveLineWords('Writer', { steps: [{ label: 'Started "Fix the footer"', made: 'started' }], writing: false })).toBe('Writer is thinking')
  })

  it('counts the turn\'s time from when it began, with moving dots, and announces only the words', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    render(<LiveLine agentName="Writer" run={{ since: 88_000, steps: [{ label: 'Searching Knowledge' }], writing: false }} />)
    const line = screen.getByTestId('live-line')
    expect(line.textContent).toBe('Writer is searching Knowledge12 s')
    expect(screen.getByRole('status').textContent).toBe('Writer is searching Knowledge')
    expect(screen.getByTestId('live-line-dots').children).toHaveLength(3)
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(line.textContent).toContain('14 s')
  })

  it('counts from when it was drawn when the screen does not know when the turn began', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    render(<LiveLine agentName="Writer" run={{ since: null, steps: [], writing: false }} />)
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(screen.getByTestId('live-line').textContent).toBe('Writer is thinking3 s')
  })
})
