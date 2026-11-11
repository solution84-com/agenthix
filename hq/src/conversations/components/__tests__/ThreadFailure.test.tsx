// @vitest-environment jsdom
/** A conversation's own failure (decision 2): a line after the thread's last message, the dialog outside a thread. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { ThreadFailure } from '../ThreadFailure'
import { ThreadNudgesContext, useThreadNudges } from '../../hooks/useThreadNudges'

afterEach(cleanup)

describe('useThreadNudges @SC-1933', () => {
  it('keeps one line per cause, changed in place, and clears it by its key', () => {
    const { result } = renderHook(() => useThreadNudges())
    act(() => result.current.push({ key: 'stop', text: 'The reply was not stopped: first.' }))
    act(() => result.current.push({ key: 'model', text: 'The model was not changed: no.' }))
    act(() => result.current.push({ key: 'stop', text: 'The reply was not stopped: second.' }))
    expect(result.current.nudges.map((n) => n.text)).toEqual(['The reply was not stopped: second.', 'The model was not changed: no.'])
    act(() => result.current.clear('stop'))
    expect(result.current.nudges.map((n) => n.key)).toEqual(['model'])
  })
})

describe('ThreadFailure', () => {
  it('in a thread, is a line pushed with its Try again, and opens no dialog', () => {
    const push = vi.fn()
    const clear = vi.fn()
    const retry = vi.fn()
    const { rerender } = render(
      <ThreadNudgesContext.Provider value={{ push, clear }}>
        <ThreadFailure text="HQ did not answer." title="The place was not added" retry={retry} />
      </ThreadNudgesContext.Provider>,
    )
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ text: 'The place was not added: HQ did not answer.', retry }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const key = push.mock.calls[0]![0].key
    rerender(
      <ThreadNudgesContext.Provider value={{ push, clear }}>
        <ThreadFailure text={null} title="The place was not added" retry={retry} />
      </ThreadNudgesContext.Provider>,
    )
    expect(clear).toHaveBeenCalledWith(key)
  })

  it('outside a thread (a task page), is the dialog with Try again', () => {
    const retry = vi.fn()
    render(<ThreadFailure text="HQ did not answer." title="The place was not added" retry={retry} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('attention-text').textContent).toBe('HQ did not answer.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })
})
