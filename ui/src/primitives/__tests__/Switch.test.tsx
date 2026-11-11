import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Switch } from '../Switch'

afterEach(cleanup)

describe('Switch, on or off @SC-1903', () => {
  it('is a switch named by its label, saying whether it is on', () => {
    render(<Switch label="Email reminders" on onChange={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Email reminders' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('a click turns it the other way', () => {
    const onChange = vi.fn()
    render(<Switch label="Email reminders" on={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Email reminders' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('is a button, so Space and Enter work it from the keyboard', () => {
    render(<Switch label="Email reminders" on={false} onChange={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Email reminders' })
    expect(sw.tagName).toBe('BUTTON')
    expect(sw.getAttribute('type')).toBe('button')
  })

  it('disabled, changes nothing', () => {
    const onChange = vi.fn()
    render(<Switch label="Locked on" on disabled onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Locked on' }) as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    fireEvent.click(sw)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('on a phone its hit area grows to 44 px tall', () => {
    render(<Switch label="Email reminders" on={false} onChange={() => {}} />)
    expect(screen.getByRole('switch').className).toContain('max-sm:before:-inset-y-3')
  })

  it('refused, stays focusable, gives the reason, and a press opens the dialog without turning it @SC-1907', () => {
    const onChange = vi.fn()
    render(<Switch label="Run on a schedule" on={false} onChange={onChange} refusal={{ reason: 'The organisation does not allow it.', title: 'Schedules are off' }} />)
    const sw = screen.getByRole('switch', { name: 'Run on a schedule' }) as HTMLButtonElement
    expect(sw.disabled).toBe(false)
    expect(sw.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toBe('The organisation does not allow it.')
    fireEvent.focus(sw)
    expect(screen.getByTestId('tooltip').textContent).toBe('The organisation does not allow it.')
    fireEvent.click(sw)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Schedules are off' })).toBeTruthy()
  })
})
