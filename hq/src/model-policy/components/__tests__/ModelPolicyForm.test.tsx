// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ useQuery: vi.fn(), set: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: h.useQuery,
  useAction: () => h.set,
  getModelPolicy: 'getModelPolicy',
  getModelChoices: 'getModelChoices',
  setModelPolicy: 'setModelPolicy',
}))

import { ModelPolicyForm } from '../ModelPolicyForm'

const none = { talking: null, lightWork: null, heavyWork: null, allowed: null, ceiling: null }

const choice = (value: string, label: string, maker = 'Anthropic') => ({ value, label, maker, via: 'via OpenRouter', price: 2 as const })
const choices = {
  current: null,
  recent: [],
  models: [choice('claude-sonnet-5', 'Claude Sonnet 5'), choice('claude-haiku-4-5', 'Claude Haiku 4.5'), choice('deepseek/v4', 'DeepSeek V4', 'DeepSeek')],
}
let policyData: unknown

beforeEach(() => {
  cleanup()
  h.set.mockReset()
  h.set.mockResolvedValue(null)
  policyData = { policy: null, organisation: { ...none, talking: 'claude-sonnet-5' } }
  h.useQuery.mockImplementation((q: string) => (q === 'getModelChoices' ? { data: choices } : { data: policyData }))
})

describe('the models form @SC-954', () => {
  it("shows the organisation's model under each row left unchosen", () => {
    render(<ModelPolicyForm scope="user" canEdit />)
    expect(screen.getByLabelText('Model for talking').textContent).toBe("The organisation's (Claude Sonnet 5)")
    expect(screen.getAllByText("The organisation's (Claude Sonnet 5)")).toHaveLength(1)
    expect(screen.getAllByText("The organisation's (each agent's own)")).toHaveLength(2)
  })

  it('sends the chosen model and nulls for the rest, naming the project for a project', async () => {
    render(<ModelPolicyForm scope="project" projectId="p1" canEdit />)
    fireEvent.click(screen.getByLabelText('Model for light work'))
    fireEvent.click(screen.getByRole('option', { name: /Claude Haiku 4\.5/ }))
    fireEvent.click(screen.getByText('Save models'))
    await waitFor(() => expect(h.set).toHaveBeenCalledWith({
      scope: 'project', projectId: 'p1', ...none, lightWork: 'claude-haiku-4-5',
    }))
  })

  it("shows the server's reason when a save is refused", async () => {
    h.set.mockRejectedValue(new Error("The ceiling 'claude-opus-5' is above the organisation's ceiling 'claude-sonnet-5'"))
    render(<ModelPolicyForm scope="user" canEdit />)
    fireEvent.click(screen.getByText('Save models'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/above the organisation's ceiling/)
  })

  it('does not send a list that restricts and holds nothing', async () => {
    render(<ModelPolicyForm scope="user" canEdit />)
    fireEvent.click(screen.getByLabelText('Only these'))
    fireEvent.click(screen.getByText('Save models'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least one/)
    expect(h.set).not.toHaveBeenCalled()
  })

  it('offers the same searchable picker for every model row and the ceiling, with the empty choice on top', () => {
    render(<ModelPolicyForm scope="user" canEdit />)
    fireEvent.click(screen.getByLabelText('Ceiling'))
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('No ceiling')
    expect(screen.getByLabelText('Search models')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'deep' } })
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([expect.stringContaining('DeepSeek V4')])
  })

  it('asks for the choices by the policy it sets', () => {
    render(<ModelPolicyForm scope="project" projectId="p1" canEdit />)
    expect(h.useQuery).toHaveBeenCalledWith('getModelChoices', { policyScope: 'project', projectId: 'p1' })
    cleanup()
    render(<ModelPolicyForm scope="org" canEdit />)
    expect(h.useQuery).toHaveBeenCalledWith('getModelChoices', { policyScope: 'org' })
  })

  it('clears a row back to the empty choice', async () => {
    policyData = { policy: { ...none, talking: 'claude-haiku-4-5' }, organisation: { ...none } }
    render(<ModelPolicyForm scope="user" canEdit />)
    fireEvent.click(screen.getByLabelText('Model for talking'))
    fireEvent.click(screen.getAllByRole('option')[0])
    fireEvent.click(screen.getByText('Save models'))
    await waitFor(() => expect(h.set).toHaveBeenCalledWith({ scope: 'user', ...none }))
  })

  it('reads as text, with no save, for a member who cannot change it', () => {
    render(<ModelPolicyForm scope="project" projectId="p1" canEdit={false} />)
    expect(screen.queryByText('Save models')).toBeNull()
    expect(screen.getByText("The organisation's (Claude Sonnet 5)")).toBeTruthy()
  })

  it("says on the organisation's own form that it is the default and others only narrow it", () => {
    render(<ModelPolicyForm scope="org" canEdit />)
    expect(screen.getByText(/default for every person and project/)).toBeTruthy()
  })
})
