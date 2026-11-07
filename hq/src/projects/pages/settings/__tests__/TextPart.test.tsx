// @vitest-environment jsdom
/** A text part of Settings: a field for those who may change it, saved on leaving it, text for the rest. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TextPart } from '../Part'

function part(over: Partial<React.ComponentProps<typeof TextPart>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<TextPart label="Name" id="n" value="Web" canEdit onSave={onSave} {...over} />)
  return onSave
}

describe('a text part @SC-639', () => {
  it('is plain text, not a field, for someone who may not change it', () => {
    part({ canEdit: false })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Web')).toBeTruthy()
  })

  it('saves on leaving the field and shows nothing when it worked', async () => {
    const onSave = part()
    const input = screen.getByLabelText('Name')
    fireEvent.change(input, { target: { value: 'Website' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Website'))
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not save when nothing changed', () => {
    const onSave = part()
    fireEvent.blur(screen.getByLabelText('Name'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('opens a dialog with the refusal and Try again, and keeps what was typed', async () => {
    part({ onSave: vi.fn().mockRejectedValue(new Error('Key already in use')) })
    const input = screen.getByLabelText('Name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Taken' } })
    fireEvent.blur(input)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain("Name wasn't changed")
    expect(dialog.textContent).toContain('Key already in use')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(input.value).toBe('Taken')
  })

  it('refuses a value that fails its check without calling the server', async () => {
    const onSave = part({ validate: next => (next ? null : 'A project needs a name') })
    const input = screen.getByLabelText('Name')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.blur(input)
    expect((await screen.findByRole('alert')).textContent).toBe('A project needs a name')
    expect(onSave).not.toHaveBeenCalled()
  })
})
