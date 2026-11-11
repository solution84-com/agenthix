import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Button } from '../Button'
import { BUTTON_GHOST, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_VARIANT } from '../buttonStyles'

afterEach(cleanup)

describe('the button looks for a link or a bare element @SC-1900', () => {
  it('are the strings Button draws, so they cannot drift', () => {
    expect(BUTTON_PRIMARY).toContain(BUTTON_VARIANT.primary)
    expect(BUTTON_SECONDARY).toContain(BUTTON_VARIANT.secondary)
    expect(BUTTON_GHOST).toContain(BUTTON_VARIANT.ghost)
    render(<><Button variant="primary">Go</Button><Button variant="secondary">Back</Button></>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain(BUTTON_VARIANT.primary)
    expect(screen.getByRole('button', { name: 'Back' }).className).toContain(BUTTON_VARIANT.secondary)
  })

  it('carry keyboard focus and the disabled look', () => {
    for (const look of [BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST]) {
      expect(look).toContain('focus-visible:outline-accent')
      expect(look).toContain('disabled:opacity-40')
    }
  })
})

describe('every button variant @SC-1900', () => {
  it('has a hover step and a pressed step, neither while disabled', () => {
    for (const look of Object.values(BUTTON_VARIANT)) {
      expect(look).toMatch(/not-disabled:hover:/)
      expect(look).toMatch(/not-disabled:active:/)
      expect(look).not.toMatch(/(^|\s)(hover|active):/)
    }
  })
})
