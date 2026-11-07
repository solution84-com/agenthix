// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Tooltip } from '../Tooltip'

describe('Tooltip', () => {
  it('shows the name on hover and hides it on leave, while the control keeps its accessible name', () => {
    render(<Tooltip label="Projects"><a href="/projects" aria-label="Projects">icon</a></Tooltip>)
    const link = screen.getByRole('link', { name: 'Projects' })
    expect(screen.queryByTestId('tooltip')).toBeNull()
    fireEvent.mouseEnter(link)
    expect(screen.getByTestId('tooltip').textContent).toBe('Projects')
    fireEvent.mouseLeave(link)
    expect(screen.queryByTestId('tooltip')).toBeNull()
    cleanup()
  })

  it('shows on keyboard focus, hides on blur and on Escape', () => {
    render(<Tooltip label="Tasks"><a href="/tasks" aria-label="Tasks">icon</a></Tooltip>)
    const link = screen.getByRole('link', { name: 'Tasks' })
    fireEvent.focus(link)
    expect(screen.getByTestId('tooltip').textContent).toBe('Tasks')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('tooltip')).toBeNull()
    fireEvent.focus(link)
    fireEvent.blur(link)
    expect(screen.queryByTestId('tooltip')).toBeNull()
    cleanup()
  })

  it('does not become a second accessible name', () => {
    render(<Tooltip label="Agents"><button type="button" aria-label="Agents">i</button></Tooltip>)
    fireEvent.focus(screen.getByRole('button', { name: 'Agents' }))
    expect(screen.getAllByText('Agents')).toHaveLength(1)
    expect(screen.getByTestId('tooltip').getAttribute('aria-hidden')).toBe('true')
    cleanup()
  })
})
