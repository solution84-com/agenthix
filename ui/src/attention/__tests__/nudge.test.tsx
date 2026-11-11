// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FrameLine, Nudge } from '..'

afterEach(cleanup)

describe('Nudge @SC-1942', () => {
  it('is one quiet line a screen reader hears without being interrupted, its action inline and whole', () => {
    const go = vi.fn()
    render(<Nudge place="meta" action={{ label: 'Which agents', onClick: go }}>Kitchen Mac did not answer ·</Nudge>)
    const line = screen.getByRole('status')
    expect(line.getAttribute('aria-live')).toBe('polite')
    expect(line.className).not.toMatch(/\b(?:border|bg-|rounded)/)
    const action = screen.getByRole('button', { name: 'Which agents' })
    expect(line.contains(action)).toBe(true)
    expect(action.className).toContain('whitespace-nowrap')
    fireEvent.click(action)
    expect(go).toHaveBeenCalled()
  })

  it('draws nothing without words, and keeps a reserved slot at the same height', () => {
    const { container, rerender } = render(<Nudge place="meta" />)
    expect(container.firstChild).toBeNull()
    rerender(<Nudge place="meta" reserve />)
    const empty = container.querySelector('[data-nudge-slot]')!
    expect(empty.textContent).toBe('')
    rerender(<Nudge place="meta" reserve>Not up to date</Nudge>)
    const shown = container.querySelector('[data-nudge-slot]')!
    expect(shown.className).toBe(empty.className)
    expect(shown.className).toContain('min-h-5')
  })

  it('sits inline in a row, and indented after a thread', () => {
    render(<><Nudge place="row">Not answering since 09:12</Nudge><Nudge place="thread">Kernel could not be stopped.</Nudge></>)
    const [row, thread] = screen.getAllByRole('status')
    expect(row.tagName).toBe('SPAN')
    expect(thread.className).toContain('ml-9')
  })

  it('in place of the content, says what could not be shown, why, and Try again', () => {
    const retry = vi.fn()
    render(<Nudge place="content" title="The providers could not be read" action={{ label: 'Try again', onClick: retry }}>HQ did not answer.</Nudge>)
    expect(screen.getByRole('status').textContent).toBe('The providers could not be readHQ did not answer.Try again')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })
})

describe('FrameLine', () => {
  it('draws only when given words, quietly, over the room under the bar', () => {
    const { rerender } = render(<FrameLine>{null}</FrameLine>)
    expect(screen.queryByTestId('frame-line')).toBeNull()
    rerender(<FrameLine>HQ is not answering. Trying again…</FrameLine>)
    const line = screen.getByRole('status')
    expect(line.textContent).toBe('HQ is not answering. Trying again…')
    expect(line.className).toContain('absolute')
    expect(line.className).toContain('truncate')
  })
})
