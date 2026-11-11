import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AgentPicker } from '../AgentPicker'

afterEach(cleanup)

const agents = [{ id: 'a', name: 'Writer' }, { id: 'b', name: 'Reviewer' }]

describe('a task’s agent picker', () => {
  it('marks the current agent as the chosen item of its menu, and a choice assigns @SC-1904', () => {
    const onAssign = vi.fn()
    render(<AgentPicker currentAgentId="a" agents={agents} onAssign={onAssign} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent: Writer' }))
    expect(screen.getByRole('menuitemradio', { name: /Writer/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: /Reviewer/ }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Reviewer/ }))
    expect(onAssign).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('offers Unassign only while an agent is set', () => {
    const onAssign = vi.fn()
    render(<AgentPicker currentAgentId="a" agents={agents} onAssign={onAssign} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent: Writer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }))
    expect(onAssign).toHaveBeenCalledWith(null)
    cleanup()
    render(<AgentPicker currentAgentId={null} agents={agents} onAssign={onAssign} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent: No agent' }))
    expect(screen.queryByRole('menuitem', { name: 'Unassign' })).toBeNull()
  })

  it('opens nothing while disabled', () => {
    render(<AgentPicker currentAgentId="a" agents={agents} onAssign={() => {}} disabled disabledReason="Viewers cannot assign" />)
    const trigger = screen.getByRole('button', { name: 'Agent: Writer' }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
