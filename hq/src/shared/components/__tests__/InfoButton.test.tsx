// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InfoButton } from '../InfoButton'

afterEach(cleanup)

const show = () => render(
  <div>
    <InfoButton label="About Adaptive voice"><p>What it does.</p></InfoButton>
    <button type="button">Elsewhere</button>
  </div>,
)
const button = () => screen.getByRole('button', { name: 'About Adaptive voice' })

describe('the (i) beside a setting', () => {
  it('is a button, closed until it is pressed, and says whether it is open', () => {
    show()
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('What it does.')).toBeNull()
    fireEvent.click(button())
    expect(button().getAttribute('aria-expanded')).toBe('true')
    const box = screen.getByRole('dialog', { name: 'About Adaptive voice' })
    expect(box.textContent).toBe('What it does.')
    expect(button().getAttribute('aria-controls')).toBe(box.id)
  })

  it('closes when pressed again', () => {
    show()
    fireEvent.click(button())
    fireEvent.click(button())
    expect(screen.queryByText('What it does.')).toBeNull()
  })

  it('closes on Escape and gives focus back to the button', () => {
    show()
    fireEvent.click(button())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('What it does.')).toBeNull()
    expect(document.activeElement).toBe(button())
  })

  it('closes on a click elsewhere, and stays open on a click inside it', () => {
    show()
    fireEvent.click(button())
    fireEvent.mouseDown(screen.getByText('What it does.'))
    expect(screen.queryByText('What it does.')).not.toBeNull()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByText('What it does.')).toBeNull()
  })
})
