import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InlineEdit } from '../InlineEdit'

describe('InlineEdit @SC-1944', () => {
  it('starts editing from the keyboard with Enter or Space', () => {
    render(<InlineEdit value="Title" onSave={async () => {}} />)
    const display = screen.getByRole('button', { name: 'Title' })
    fireEvent.keyDown(display, { key: 'Enter' })
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('says a refused value under the field, as a status, and keeps the text', async () => {
    const onSave = vi.fn().mockRejectedValue(Object.assign(new Error('Name is taken. Nothing was changed.'), { status: 409 }))
    render(<InlineEdit value="Title" onSave={onSave} />)
    fireEvent.click(screen.getByText('Title'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('status')).textContent).toContain('Name is taken')
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Other')
  })

  it('opens the dialog with Try again when the save failed for another reason, and tries again', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 503 })).mockResolvedValue(undefined)
    render(<InlineEdit value="Title" onSave={onSave} />)
    fireEvent.click(screen.getByText('Title'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByTestId('attention-text')).textContent).toContain('Could not save')
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave).toHaveBeenLastCalledWith('Other')
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
