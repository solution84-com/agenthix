import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InlineEdit } from '../InlineEdit'

describe('InlineEdit', () => {
  it('starts editing from the keyboard with Enter or Space', () => {
    render(<InlineEdit value="Title" onSave={async () => {}} />)
    const display = screen.getByRole('button', { name: 'Title' })
    fireEvent.keyDown(display, { key: 'Enter' })
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('shows the reason when a save is refused and keeps the text', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Name is taken. Nothing was changed.'))
    render(<InlineEdit value="Title" onSave={onSave} />)
    fireEvent.click(screen.getByText('Title'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Name is taken')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Other')
  })

  it('does not overwrite the draft when the value changes while editing', () => {
    const { rerender } = render(<InlineEdit value="Title" onSave={async () => {}} />)
    fireEvent.click(screen.getByText('Title'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Typing' } })
    rerender(<InlineEdit value="Changed elsewhere" onSave={async () => {}} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Typing')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    waitFor(() => expect(screen.getByText('Changed elsewhere')).toBeTruthy())
  })
})
