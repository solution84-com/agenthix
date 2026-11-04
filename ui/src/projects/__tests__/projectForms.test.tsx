import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateProjectModal } from '../CreateProjectModal'
import { AutomationLimitsForm } from '../AutomationLimitsForm'
import type { AutomationStatusView } from '../AutomationTypes'

describe('New Project', () => {
  it('keeps a key the person typed when the name is edited afterwards', () => {
    render(
      <CreateProjectModal
        open onClose={() => {}} sites={[{ siteId: 's1', name: 'Site', status: 'ONLINE' }]}
        actions={{ createProject: vi.fn() }}
      />,
    )
    const name = screen.getByLabelText('Project Name') as HTMLInputElement
    const key = screen.getByLabelText('Key') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Website' } })
    const derived = key.value
    expect(derived).not.toBe('')
    fireEvent.change(key, { target: { value: 'QRS' } })
    fireEvent.change(name, { target: { value: 'Website redesign' } })
    expect(key.value).toBe('QRS')
  })
})

describe('the automation limits form', () => {
  const status = {
    org: { allowed: true, intervalMinutes: 10, batchSize: 3, queueLimit: 20, agentSchedules: false, throttle: false, maxDepth: 5 },
    choice: null,
  } as unknown as AutomationStatusView

  it('refuses a negative or fractional limit before it reaches the server', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<AutomationLimitsForm status={status} runLimits={undefined} onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Queue limit/), { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/whole number/)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Queue limit/), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
  })
})
