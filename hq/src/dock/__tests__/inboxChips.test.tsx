// @vitest-environment jsdom
/** The tabs both lists share: All, Unread, and Needs you only while something does; a choice of one. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InboxChips } from '../InboxChips'

afterEach(cleanup)

describe('InboxChips', () => {
  it('leaves Needs you out while nothing needs the person', () => {
    render(<InboxChips filters={{ needsYou: false, unread: false }} totals={{ needsYou: 0, unread: 2 }} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Needs you/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps Needs you while it is chosen, though nothing needs the person now', () => {
    render(<InboxChips filters={{ needsYou: true, unread: false }} totals={{ needsYou: 0, unread: 0 }} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /^Needs you/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('is a choice of one: each tab chooses itself alone', () => {
    const onChange = vi.fn()
    render(<InboxChips filters={{ needsYou: true, unread: false }} totals={{ needsYou: 1, unread: 1 }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onChange).toHaveBeenLastCalledWith({ needsYou: false, unread: false })
    fireEvent.click(screen.getByRole('button', { name: /^Unread/ }))
    expect(onChange).toHaveBeenLastCalledWith({ needsYou: false, unread: true })
  })
})
