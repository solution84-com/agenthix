import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('is a dialog named by its title, so a screen reader announces it', () => {
    render(<Modal open onClose={() => {}} title="Remove laptop-mia?"><button type="button">Remove laptop-mia</button></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Remove laptop-mia?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(screen.getByRole('button', { name: 'Remove laptop-mia' }))).toBe(true)
  })
})
