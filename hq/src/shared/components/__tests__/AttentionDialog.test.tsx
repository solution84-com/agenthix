// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useAttention } from '../AttentionDialog'

function Probe({ retry }: { retry?: () => void }) {
  const { show, dialog } = useAttention()
  return <><button onClick={() => show({ title: 'It could not be removed', text: 'Only administrators remove skills. Nothing was changed.', retry })}>go</button><p>the page</p>{dialog}</>
}

afterEach(cleanup)

describe('the attention dialog', () => {
  it('opens in the centre as a dialog with the words, Close and Try again, and the page keeps its layout', () => {
    const retry = vi.fn()
    render(<Probe retry={retry} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('go'))
    const dialog = screen.getByRole('dialog', { name: 'It could not be removed' })
    expect(dialog.textContent).toContain('Only administrators remove skills. Nothing was changed.')
    expect(screen.queryByRole('alert', { hidden: false })?.closest('[role="dialog"]')).toBe(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no Try again without a retry, and Close dismisses it', () => {
    render(<Probe />)
    fireEvent.click(screen.getByText('go'))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close' })) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
