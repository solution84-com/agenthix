// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceSection } from '../AppearanceSection'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('AppearanceSection @SC-489', () => {
  it('shows light selected by default', () => {
    render(<AppearanceSection />)
    expect((screen.getByLabelText(/Light/) as HTMLInputElement).checked).toBe(true)
  })

  it('switches to dark, remembers it, and switches back', () => {
    render(<AppearanceSection />)
    fireEvent.click(screen.getByLabelText(/Dark/))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('agenthix-theme')).toBe('dark')
    fireEvent.click(screen.getByLabelText(/Light/))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
