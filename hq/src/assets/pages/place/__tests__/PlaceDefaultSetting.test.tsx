// @vitest-environment jsdom
/** The place's default for skills in files: a labelled setting changed in place, never looser than the organisation's. */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const setDefault = vi.fn(async (_a: unknown) => ({}))
vi.mock('wasp/client/operations', () => ({ setPlaceSkillsDefault: (a: unknown) => setDefault(a) }))

import { PlaceDefaultSetting } from '../PlaceDefaultSetting'

beforeEach(() => setDefault.mockClear())
afterEach(cleanup)

const draw = (over: Partial<React.ComponentProps<typeof PlaceDefaultSetting>> = {}) =>
  render(<PlaceDefaultSetting projectId="p1" effective="OFF" org="OFF" placeDefault={null} canChange {...over} />)

describe('PlaceDefaultSetting', () => {
  it('is a labelled control showing the default, with the organisation\'s in words beside it', () => {
    draw()
    const select = screen.getByLabelText('Skills found in files') as HTMLSelectElement
    expect(select.value).toBe('OFF')
    expect(screen.getByTestId('place-default-org').textContent).toBe("The organisation's default is off by default.")
  })

  it('changes in place, to a stricter choice', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Skills found in files'), { target: { value: 'NEVER' } })
    expect(setDefault).toHaveBeenCalledWith({ projectId: 'p1', value: 'NEVER' })
  })

  it('shows a looser choice unavailable, and says why', () => {
    draw()
    const on = screen.getByRole('option', { name: 'On by default' }) as HTMLOptionElement
    expect(on.disabled).toBe(true)
    expect(screen.getByTestId('place-default-unavailable').textContent).toMatch(/On by default isn't available: The organisation's is off by default/)
  })

  it('names the place\'s own stricter choice beside the organisation\'s', () => {
    draw({ effective: 'NEVER', placeDefault: 'NEVER' })
    expect(screen.getByTestId('place-default-org').textContent).toMatch(/and this place's is never/)
  })

  it('is only words for someone who may not change it', () => {
    draw({ canChange: false })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Off by default')).toBeTruthy()
  })
})
