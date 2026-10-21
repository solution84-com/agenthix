// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlaceAvatar, placeAvatarColor, placeAvatarInitial } from '@agenthix/ui/primitives'


describe('placeAvatarColor @SC-494', () => {
  it('gives the same colour for the same item every time', () => {
    expect(placeAvatarColor('proj_123')).toBe(placeAvatarColor('proj_123'))
  })

  it('gives different colours to different items', () => {
    const colours = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map(placeAvatarColor))
    expect(colours.size).toBeGreaterThan(5)
  })

  it('returns a colour that is readable behind white text', () => {
    expect(placeAvatarColor('anything')).toMatch(/^hsl\(\d{1,3} \d+% [34]\d%\)$/)
  })
})

describe('placeAvatarInitial @SC-494', () => {
  it('is the first letter of the name, upper-cased', () => {
    expect(placeAvatarInitial('  marketing site')).toBe('M')
  })

  it('falls back to a question mark for an empty name', () => {
    expect(placeAvatarInitial('  ')).toBe('?')
  })
})

describe('PlaceAvatar @SC-494', () => {
  it('shows a project\'s initial', () => {
    render(<PlaceAvatar kind="project" id="p1" name="Agenthix" />)
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('shows a board mark, not an initial, for a board', () => {
    const { container } = render(<PlaceAvatar kind="board" id="b1" name="Release" />)
    expect(screen.queryByText('R')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('applies the derived colour and the size', () => {
    const { container } = render(<PlaceAvatar kind="project" id="p1" name="Agenthix" size="lg" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.backgroundColor).not.toBe('')
    expect(el.className).toContain('w-10')
  })
})
