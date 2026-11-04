// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ useQuery: vi.fn(), setMyTimezone: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: h.useQuery,
  useAction: (fn: unknown) => fn,
  getUserSettings: 'getUserSettings',
  setMyTimezone: h.setMyTimezone,
}))

import { TimezoneSection } from '../TimezoneSection'

beforeEach(() => {
  vi.clearAllMocks()
  h.setMyTimezone.mockResolvedValue(undefined)
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Australia/Sydney' } as Intl.ResolvedDateTimeFormatOptions)
})

describe('TimezoneSection', () => {
  it('shows a browser-derived timezone as such, with the browser option selected', () => {
    h.useQuery.mockReturnValue({ data: { timezone: 'Australia/Sydney', timezoneChosen: false } })
    render(<TimezoneSection />)
    expect((screen.getByLabelText('Your time zone') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText(/Currently Australia\/Sydney, from this browser/)).toBeTruthy()
  })

  it('shows the person\'s own choice selected', () => {
    h.useQuery.mockReturnValue({ data: { timezone: 'Europe/London', timezoneChosen: true } })
    render(<TimezoneSection />)
    expect((screen.getByLabelText('Your time zone') as HTMLSelectElement).value).toBe('Europe/London')
  })

  it('saves a chosen zone, and the browser option clears it', async () => {
    h.useQuery.mockReturnValue({ data: { timezone: 'Europe/London', timezoneChosen: true } })
    render(<TimezoneSection />)
    const select = screen.getByLabelText('Your time zone')
    fireEvent.change(select, { target: { value: 'Asia/Tokyo' } })
    await waitFor(() => expect(h.setMyTimezone).toHaveBeenCalledWith({ timezone: 'Asia/Tokyo' }))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(h.setMyTimezone).toHaveBeenLastCalledWith({ timezone: null }))
  })

  it('shows why a save was refused', async () => {
    h.useQuery.mockReturnValue({ data: { timezone: null, timezoneChosen: false } })
    h.setMyTimezone.mockRejectedValue(new Error('"x" is not a timezone'))
    render(<TimezoneSection />)
    fireEvent.change(screen.getByLabelText('Your time zone'), { target: { value: 'Asia/Tokyo' } })
    expect(await screen.findByText('"x" is not a timezone')).toBeTruthy()
  })
})
