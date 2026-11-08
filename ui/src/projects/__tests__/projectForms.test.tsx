import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AutomationLimitsForm } from '../AutomationLimitsForm'

describe('the automation limits form', () => {
  const runLimits = { org: { timeLimitMinutes: 60, turnLimit: 100 }, own: { timeLimitMinutes: null, turnLimit: null } }

  it('refuses a negative or fractional turn limit before it reaches the server', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<AutomationLimitsForm runLimits={runLimits} onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Turn limit/), { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/whole number/)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Turn limit/), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(4))
  })

  it('offers no throttle, queue limit or chain depth to set: nothing but an explicit act starts work (adr-0175)', () => {
    render(<AutomationLimitsForm runLimits={runLimits} onSave={vi.fn()} onCancel={() => {}} />)
    expect(screen.queryByText(/Throttle/)).toBeNull()
    expect(screen.queryByLabelText(/Queue limit/)).toBeNull()
    expect(screen.queryByLabelText(/Chain depth/)).toBeNull()
  })
})
