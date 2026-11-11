// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useBackgroundRead, type BackgroundQuery } from '..'

const READ_AT = new Date(2026, 10, 11, 10, 42).getTime()

function Screen({ query }: { query: BackgroundQuery }) {
  const { nudge, stale, failedWithoutData } = useBackgroundRead(query, { what: 'The providers' })
  return <div data-testid="screen" data-stale={stale} data-empty={failedWithoutData}>{nudge}</div>
}

const q = (over: Partial<BackgroundQuery>): BackgroundQuery => ({ data: undefined, error: null, dataUpdatedAt: 0, refetch: vi.fn(), ...over })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(READ_AT + 5_000) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('useBackgroundRead', () => {
  it('shows nothing during the retries (no error yet), with or without data', () => {
    const { rerender } = render(<Screen query={q({})} />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<Screen query={q({ data: [1], dataUpdatedAt: READ_AT })} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('after the retries with nothing on screen, says so in place of the content, with Try again', () => {
    const refetch = vi.fn()
    render(<Screen query={q({ error: new Error('down'), refetch })} />)
    expect(screen.getByRole('status').textContent).toContain('The providers could not be read')
    expect(screen.getByTestId('screen').dataset.empty).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('says a final answer in its own words, without Try again', () => {
    render(<Screen query={q({ error: Object.assign(new Error('There is no such page here.'), { statusCode: 404 }) })} />)
    expect(screen.getByRole('status').textContent).toBe('There is no such page here.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('with older data on screen, says nothing until it is a minute old, then "Not up to date"', () => {
    render(<Screen query={q({ data: [1], dataUpdatedAt: READ_AT, error: new Error('down') })} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('screen').dataset.stale).toBe('false')
    expect(screen.getByTestId('screen').dataset.empty).toBe('false')
    act(() => { vi.advanceTimersByTime(56_000) })
    expect(screen.getByRole('status').textContent).toBe('Not up to date · read 10:42 · Try again')
    expect(screen.getByTestId('screen').dataset.stale).toBe('true')
  })

  it('clears on the next good read', () => {
    vi.setSystemTime(READ_AT + 120_000)
    const { rerender } = render(<Screen query={q({ data: [1], dataUpdatedAt: READ_AT, error: new Error('down') })} />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Screen query={q({ data: [1, 2], dataUpdatedAt: READ_AT + 120_000, error: null })} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('screen').dataset.stale).toBe('false')
  })
})
