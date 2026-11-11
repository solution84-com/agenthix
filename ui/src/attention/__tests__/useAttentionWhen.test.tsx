// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useAttentionWhen } from '../useAttentionWhen'

afterEach(cleanup)

function Failing({ text, retry }: { text: string | null; retry?: () => void }) {
  const dialog = useAttentionWhen(text, { kind: 'alert', title: 'Could not save', retry })
  return <div data-testid="content">{dialog}</div>
}

describe('useAttentionWhen @SC-1906', () => {
  it('draws nothing in the content and opens the dialog when words appear', () => {
    const { rerender } = render(<Failing text={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Failing text="The site did not answer. Nothing was changed." />)
    expect(screen.getByRole('alert').textContent).toBe('The site did not answer. Nothing was changed.')
    expect(screen.getByText('Could not save')).toBeTruthy()
  })

  it('closes with Close and does not open again for the same words', () => {
    const { rerender } = render(<Failing text="No." />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Failing text="No." />)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Failing text="Not that either." />)
    expect(screen.getByRole('alert').textContent).toBe('Not that either.')
  })

  it('offers Try again when there is a way', () => {
    let tried = 0
    render(<Failing text="No." retry={() => { tried += 1 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(tried).toBe(1)
  })
})

describe('useAttentionWhen as a nudge', () => {
  function Quiet({ text, retry }: { text: string | null; retry?: () => void }) {
    return <div data-testid="content">{useAttentionWhen(text, { kind: 'nudge', place: 'meta', retry })}</div>
  }

  it('is a line where it is rendered, never a dialog, and goes when the words clear', () => {
    const retry = vi.fn()
    const { rerender } = render(<Quiet text={null} retry={retry} />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<Quiet text="Kitchen Mac did not answer." retry={retry} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('content').textContent).toContain('Kitchen Mac did not answer.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    rerender(<Quiet text={null} retry={retry} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
