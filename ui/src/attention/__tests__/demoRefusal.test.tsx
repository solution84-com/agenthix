// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useAttentionWhen } from '../useAttentionWhen'
import { isDemoRefusal, useAttention } from '../../primitives'

afterEach(cleanup)

/** A failure as Wasp's client hands it over: the server's JSON answer is the error's `data`. */
function failure(message: string, data: unknown): Error {
  return Object.assign(new Error(message), { statusCode: 403, data })
}

function Failing({ text, retry }: { text: unknown; retry: () => void }) {
  return <>{useAttentionWhen(text, { kind: 'alert', title: 'The role was not changed', retry })}</>
}

function Shown({ text, retry }: { text: string; retry: () => void }) {
  const { show, dialog } = useAttention()
  return <><button onClick={() => show({ title: 'The goal was not saved', text, retry })}>go</button>{dialog}</>
}

describe("the public demo's refusal is final: no Try again @SC-2000", () => {
  it('tells the demo refusal by the answer carrying demo: true', () => {
    expect(isDemoRefusal(failure("The demo can't do this. Nothing was changed.", { message: 'x', demo: true }))).toBe(true)
    expect(isDemoRefusal(failure('Forbidden', { message: 'Forbidden' }))).toBe(false)
    expect(isDemoRefusal(new Error('HQ did not answer.'))).toBe(false)
    expect(isDemoRefusal(null)).toBe(false)
  })

  it('a failure handed to useAttentionWhen with demo: true has Close only', () => {
    render(<Failing text={failure("The demo can't do this. Nothing was changed.", { demo: true })} retry={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toBe("The demo can't do this. Nothing was changed.")
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it("words handed to the dialog that are the demo's refusal have no Try again", () => {
    render(<Shown text="The demo can't do this. Nothing was changed." retry={vi.fn()} />)
    fireEvent.click(screen.getByText('go'))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('any other failure keeps Try again, as outside the demo', () => {
    const retry = vi.fn()
    render(<Failing text={failure('The site did not answer. Nothing was changed.', { message: 'x' })} retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    cleanup()
    render(<Shown text="The site did not answer." retry={vi.fn()} />)
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
