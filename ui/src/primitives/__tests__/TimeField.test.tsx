import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeField } from '../DateField'

describe('TimeField, a time of day drawn as every field', () => {
  it('writes the time 24-hour, the app’s way, over the browser’s own field, whose picker icon is hidden', () => {
    render(<TimeField aria-label="Time" value="09:00" onChange={() => {}} />)
    const input = screen.getByLabelText('Time') as HTMLInputElement
    expect(input.type).toBe('time')
    expect(input.className).toContain('text-transparent')
    expect(input.className).toContain('[&::-webkit-calendar-picker-indicator]:opacity-0')
    expect(screen.getByText('09:00')).toBeTruthy()
  })

  it('passes a change on', () => {
    const onChange = vi.fn()
    render(<TimeField aria-label="Time" value="09:00" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '14:30' } })
    expect(onChange).toHaveBeenCalled()
  })
})
