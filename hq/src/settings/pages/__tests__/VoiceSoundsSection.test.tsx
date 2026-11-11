// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ useQuery: vi.fn(), updateUserSettings: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: h.useQuery,
  useAction: (fn: unknown) => fn,
  getUserSettings: 'getUserSettings',
  updateUserSettings: h.updateUserSettings,
}))

import { VoiceSoundsSection } from '../VoiceSoundsSection'

const shown = (voiceSounds: boolean | undefined) => h.useQuery.mockReturnValue({ data: { voiceSounds }, refetch: h.refetch })
const toggle = () => screen.getByRole('switch', { name: 'Voice sounds' })

beforeEach(() => {
  vi.clearAllMocks()
  h.updateUserSettings.mockResolvedValue(undefined)
  h.refetch.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('the person\'s voice sounds @SC-1928', () => {
  it('is on by default, and one line says which sounds a call makes', () => {
    shown(undefined)
    render(<VoiceSoundsSection />)
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/^On\. A short sound when voice is ready/)).toBeTruthy()
  })

  it('turns them off and on for the person themselves', async () => {
    shown(true)
    render(<VoiceSoundsSection />)
    fireEvent.click(toggle())
    await waitFor(() => expect(h.updateUserSettings).toHaveBeenCalledWith({ voiceSounds: false }))
    cleanup()
    shown(false)
    render(<VoiceSoundsSection />)
    expect(screen.getByText(/^Off\. A call makes no sounds of its own/)).toBeTruthy()
    fireEvent.click(toggle())
    await waitFor(() => expect(h.updateUserSettings).toHaveBeenCalledWith({ voiceSounds: true }))
  })
})
