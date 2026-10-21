// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RefusedAction } from '../RefusedAction'
import { refusalText } from '../../refusal'

afterEach(cleanup)

describe('a refused action of the person\'s own @SC-1012', () => {
  it('shows the server\'s reason as it came', () => {
    render(<RefusedAction reason={refusalText(new Error('You can no longer write in this project.'))} />)
    expect(screen.getByRole('alert').textContent).toContain('You can no longer write in this project.')
  })

  it('falls back to a plain sentence when the server gave no reason', () => {
    expect(refusalText(new Error('  '))).toBe('That did not work. Try again.')
    expect(refusalText('nope', 'Could not archive')).toBe('Could not archive')
  })

  it('shows nothing without a reason, and offers Dismiss only when it can be dismissed', () => {
    const { rerender } = render(<RefusedAction reason={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<RefusedAction reason="No." />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    const onDismiss = vi.fn()
    rerender(<RefusedAction reason="No." onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
