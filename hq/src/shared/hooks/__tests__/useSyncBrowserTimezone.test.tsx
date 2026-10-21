// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({ useQuery: vi.fn(), sync: vi.fn(), useAuth: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: h.useQuery,
  // Like Wasp's own useAction: a new function on every render.
  useAction: () => (args: unknown) => h.sync(args),
  getUserSettings: 'getUserSettings',
  syncBrowserTimezone: 'syncBrowserTimezone',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: h.useAuth }))

import { useSyncBrowserTimezone } from '../useSyncBrowserTimezone'

beforeEach(() => {
  vi.clearAllMocks()
  h.sync.mockResolvedValue(undefined)
  h.useAuth.mockReturnValue({ data: { id: 'u1' } })
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Australia/Sydney' } as Intl.ResolvedDateTimeFormatOptions)
})

describe('useSyncBrowserTimezone', () => {
  it('reports the browser zone when the person has none', () => {
    h.useQuery.mockReturnValue({ data: { timezone: null, timezoneChosen: false } })
    renderHook(() => useSyncBrowserTimezone())
    expect(h.sync).toHaveBeenCalledWith({ timezone: 'Australia/Sydney' })
  })

  it('reports it when the stored one came from a browser and differs', () => {
    h.useQuery.mockReturnValue({ data: { timezone: 'Europe/London', timezoneChosen: false } })
    renderHook(() => useSyncBrowserTimezone())
    expect(h.sync).toHaveBeenCalledWith({ timezone: 'Australia/Sydney' })
  })

  it('asks once while the stored zone catches up, however often the page renders', () => {
    h.useQuery.mockReturnValue({ data: { timezone: null, timezoneChosen: false } })
    const { rerender } = renderHook(() => useSyncBrowserTimezone())
    for (let i = 0; i < 5; i++) rerender()
    expect(h.sync).toHaveBeenCalledTimes(1)
    h.useQuery.mockReturnValue({ data: { timezone: 'Australia/Sydney', timezoneChosen: false } })
    rerender()
    expect(h.sync).toHaveBeenCalledTimes(1)
  })

  it('leaves a timezone the person chose alone', () => {
    h.useQuery.mockReturnValue({ data: { timezone: 'Europe/London', timezoneChosen: true } })
    renderHook(() => useSyncBrowserTimezone())
    expect(h.sync).not.toHaveBeenCalled()
  })

  it('does nothing when it already matches, before settings load, or when signed out', () => {
    h.useQuery.mockReturnValue({ data: { timezone: 'Australia/Sydney', timezoneChosen: false } })
    renderHook(() => useSyncBrowserTimezone())
    h.useQuery.mockReturnValue({ data: undefined })
    renderHook(() => useSyncBrowserTimezone())
    h.useAuth.mockReturnValue({ data: null })
    h.useQuery.mockReturnValue({ data: { timezone: null, timezoneChosen: false } })
    renderHook(() => useSyncBrowserTimezone())
    expect(h.sync).not.toHaveBeenCalled()
  })
})
