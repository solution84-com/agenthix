// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReadFailure, Refused, ShowAttention } from '..'

afterEach(cleanup)

function Form({ onSubmit }: { onSubmit: () => void }) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit() }}>
      <ShowAttention text="It did not work." title="Not saved" />
    </form>
  )
}

describe('ShowAttention (a failure handed to it) @SC-1906', () => {
  it('draws nothing without text, and the words in a dialog with it', () => {
    const { rerender } = render(<ShowAttention text={null} />)
    expect(screen.queryByTestId('attention-text')).toBeNull()
    rerender(<ShowAttention text="Nothing was changed." title="Not saved" />)
    expect(screen.getByRole('heading', { name: 'Not saved' })).toBeTruthy()
    expect(screen.getByTestId('attention-text').textContent).toBe('Nothing was changed.')
  })

  it('takes an Error for its words', () => {
    render(<ShowAttention text={new Error('Only an administrator may.')} />)
    expect(screen.getByTestId('attention-text').textContent).toBe('Only an administrator may.')
  })

  it('calls onClose on Close, so the caller clears its state', () => {
    function Holder() {
      const [error, setError] = useState<string | null>('Refused.')
      return <ShowAttention text={error} onClose={() => setError(null)} />
    }
    render(<Holder />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('attention-text')).toBeNull()
  })

  it('stays closed for the words it was closed on, and opens again once they have cleared', () => {
    const { rerender } = render(<ShowAttention text="Refused." />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    rerender(<ShowAttention text="Refused." />)
    expect(screen.queryByTestId('attention-text')).toBeNull()
    rerender(<ShowAttention text={null} />)
    rerender(<ShowAttention text="Refused." />)
    expect(screen.getByTestId('attention-text').textContent).toBe('Refused.')
  })

  it('runs an action of its own after closing, and does not submit the form it sits in', () => {
    const onSubmit = vi.fn()
    const act = vi.fn()
    render(<><Form onSubmit={onSubmit} /><ShowAttention text="Looks like a secret." actions={[{ label: 'Add it under Secrets', onClick: act }]} /></>)
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add it under Secrets' }))
    expect(act).toHaveBeenCalled()
  })
})

describe('ReadFailure @SC-1906', () => {
  it('says what could not be read, once, with Try again where there is a way', () => {
    const retry = vi.fn()
    render(<ReadFailure what="The agents" retry={retry} />)
    expect(screen.getByRole('heading', { name: 'The agents could not be read' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    expect(screen.queryByTestId('attention-text')).toBeNull()
  })

  it('has no Try again without a way, and opens again when the error is a new one', () => {
    const { rerender } = render(<ReadFailure what="The agents" error="a" />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('attention-text')).toBeNull()
    rerender(<ReadFailure what="The agents" error="b" />)
    expect(screen.getByTestId('attention-text')).toBeTruthy()
  })
})

describe('Refused @SC-1907', () => {
  it('draws the control as it is without a refusal', () => {
    render(<Refused label="Switch"><button type="button">Go</button></Refused>)
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Switch, unavailable' })).toBeNull()
  })

  it('greys the control, gives the reason in its tooltip, and opens the dialog on a press or Enter', () => {
    const inner = vi.fn()
    render(<Refused label="Switch" refusal={{ reason: 'For administrators.', title: 'Not for you', detail: 'Ask an administrator.' }}><button type="button" onClick={inner}>Go</button></Refused>)
    const wrap = screen.getByRole('button', { name: 'Switch, unavailable' })
    expect(wrap.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(wrap)
    expect(screen.getByTestId('tooltip').textContent).toBe('For administrators.')
    fireEvent.click(wrap)
    expect(screen.getByTestId('attention-text').textContent).toBe('Ask an administrator.')
    expect(inner).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(wrap, { key: 'Enter' })
    expect(screen.getByTestId('attention-text').textContent).toBe('Ask an administrator.')
  })
})
