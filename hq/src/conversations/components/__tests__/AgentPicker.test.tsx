// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <i data-face={name} /> }))

import { AgentPicker } from '../AgentPicker'

const agent = (name: string, handle: string, role: string | null = null) => ({ id: handle, name, handle, avatarUrl: null, role })
const agents = [agent('Kernel', 'kernel', 'Coordinates the organisation'), agent('Writer', 'scribe', 'Drafts documents'), agent('Analyst', 'numbers')]
afterEach(cleanup)

const open = () => {
  const onSelect = vi.fn()
  render(<AgentPicker agents={agents} selectedId="kernel" onSelect={onSelect} />)
  fireEvent.click(screen.getByLabelText('Agent'))
  return onSelect
}
const names = () => screen.getAllByRole('option').map(o => o.textContent)

describe('the agent picker @SC-941', () => {
  it('is a plain button with the agent’s face, its name and a chevron, and no border', () => {
    render(<AgentPicker agents={agents} selectedId="kernel" onSelect={vi.fn()} />)
    const button = screen.getByLabelText('Agent')
    expect(button.textContent).toBe('Kernel')
    expect(button.querySelector('[data-face="Kernel"]')).toBeTruthy()
    expect(button.className).not.toMatch(/border/)
    expect(screen.queryByTestId('agent-picker')).toBeNull()
  })

  it('opens with the search field focused and the agents in the order given, with their roles', () => {
    open()
    expect(document.activeElement).toBe(screen.getByLabelText('Search agents'))
    expect(names()).toEqual(['KernelCoordinates the organisation', 'WriterDrafts documents', 'Analyst'])
  })

  it('searches the name, the handle and the role', () => {
    open()
    const search = screen.getByLabelText('Search agents')
    fireEvent.change(search, { target: { value: 'numbers' } })
    expect(names()).toEqual(['Analyst'])
    fireEvent.change(search, { target: { value: 'drafts' } })
    expect(names()).toEqual(['WriterDrafts documents'])
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText(/No agent matches/)).toBeTruthy()
  })

  it('walks with the arrow keys, chooses with Enter, and closes with Escape', () => {
    const onSelect = open()
    const search = screen.getByLabelText('Search agents')
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('numbers')
    expect(screen.queryByTestId('agent-picker')).toBeNull()
    fireEvent.click(screen.getByLabelText('Agent'))
    fireEvent.keyDown(screen.getByLabelText('Search agents'), { key: 'Escape' })
    expect(screen.queryByTestId('agent-picker')).toBeNull()
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('chooses by click, and marks the current agent', () => {
    const onSelect = open()
    expect(screen.getAllByRole('option').map(o => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    fireEvent.click(screen.getByText('Writer'))
    expect(onSelect).toHaveBeenCalledWith('scribe')
  })
})
