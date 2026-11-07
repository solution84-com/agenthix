// @vitest-environment jsdom
/** The ⋯ button every org screen shares: an icon button's size, 36 px wide and 44 px to tap on a phone. */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { MoreMenu } from '../menus'
import { FOCUS_RING } from '@agenthix/ui/primitives'

afterEach(cleanup)

describe('the ⋯ button', () => {
  it('is 36 px square, 44 px on a phone, with the shared focus ring', () => {
    render(<MoreMenu label="More about Alex" items={[{ label: 'Remove', onSelect: () => {} }]} />)
    const button = screen.getByRole('button', { name: 'More about Alex' })
    for (const c of ['h-9', 'w-9', 'max-sm:h-11', 'max-sm:w-11']) expect(button.classList.contains(c)).toBe(true)
    expect(button.className).toContain(FOCUS_RING)
  })
})
