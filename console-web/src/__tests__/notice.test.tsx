import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DropDown, Notice } from '../components'

afterEach(cleanup)

describe('Notice: a page notice is the attention dialog, never part of the page @SC-1909', () => {
  it('opens once with its words, a title, Try again and its own action', () => {
    const retry = vi.fn()
    const follow = vi.fn()
    render(<div>The page<Notice title="The fleet could not be read" retry={retry} actions={[{ label: 'Follow the move', onClick: follow }]}>HQ did not answer.</Notice></div>)
    expect(screen.getByRole('dialog', { name: 'The fleet could not be read' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('HQ did not answer.')
    fireEvent.click(screen.getByRole('button', { name: 'Follow the move' }))
    expect(follow).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not open again for the same words, and opens for new ones', () => {
    const { rerender } = render(<Notice>First.</Notice>)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    rerender(<Notice>First.</Notice>)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<Notice>Second.</Notice>)
    expect(screen.getByRole('alert').textContent).toBe('Second.')
  })
})

describe('DropDown: a choice that cannot be made says why @SC-1909', () => {
  const options = [
    { key: 'a', label: 'Upgrade' },
    { key: 'b', label: 'Move', refusal: { reason: 'It is moving now.', title: 'A move is under way' } },
  ]

  it('greys the option, shows the reason on hover, and a press opens the dialog without choosing it', () => {
    const onChange = vi.fn()
    render(<DropDown label="What" placeholder="Choose" options={options} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'What: Choose' }))
    const move = screen.getByRole('option', { name: 'Move' })
    expect(move.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(move)
    expect(screen.getByTestId('tooltip').textContent).toBe('It is moving now.')
    fireEvent.click(move)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'A move is under way' })).toBeTruthy()
  })

  it('refuses the whole choice, still focusable', () => {
    render(<DropDown label="Which" placeholder="Choose" options={[]} value={null} onChange={() => {}} refusal={{ reason: 'Nothing is connected yet.' }} />)
    const button = screen.getByRole('button', { name: 'Which: Choose' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('Nothing is connected yet.')
  })
})
