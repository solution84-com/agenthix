// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TOAST_MS, ToastHost, toast } from '..'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Toast', () => {
  it('says a few words in a polite region, with no buttons, and goes by itself', () => {
    render(<ToastHost />)
    act(() => toast('Copied'))
    expect(screen.getByRole('status').textContent).toBe('Copied')
    expect(screen.queryByRole('button')).toBeNull()
    act(() => { vi.advanceTimersByTime(TOAST_MS) })
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('shows one at a time: a new one replaces the last and starts its own time', () => {
    render(<ToastHost />)
    act(() => toast('Copied'))
    act(() => { vi.advanceTimersByTime(TOAST_MS - 500) })
    act(() => toast('Invitation sent'))
    expect(screen.getAllByTestId('toast').map(t => t.textContent)).toEqual(['Invitation sent'])
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('toast').textContent).toBe('Invitation sent')
  })

  it('waits while hovered or focused', () => {
    render(<ToastHost />)
    act(() => toast('Copied'))
    fireEvent.mouseEnter(screen.getByTestId('toast'))
    act(() => { vi.advanceTimersByTime(TOAST_MS * 2) })
    expect(screen.getByTestId('toast')).toBeTruthy()
    fireEvent.mouseLeave(screen.getByTestId('toast'))
    fireEvent.focus(screen.getByTestId('toast'))
    act(() => { vi.advanceTimersByTime(TOAST_MS * 2) })
    expect(screen.getByTestId('toast')).toBeTruthy()
    fireEvent.blur(screen.getByTestId('toast'))
    act(() => { vi.advanceTimersByTime(TOAST_MS) })
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('sits above the bottom by the offset the frame gives', () => {
    render(<ToastHost offset="5.5rem" />)
    const host = screen.getByRole('status')
    expect(host.style.getPropertyValue('--toast-offset')).toBe('5.5rem')
    expect(host.style.bottom).toContain('var(--toast-offset')
  })
})
