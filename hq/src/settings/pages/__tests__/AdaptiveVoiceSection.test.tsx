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

import { AdaptiveVoiceSection } from '../AdaptiveVoiceSection'

const shown = (adaptiveVoice: boolean) => h.useQuery.mockReturnValue({ data: { adaptiveVoice }, refetch: h.refetch })
const toggle = () => screen.getByRole('switch', { name: 'Adaptive voice' })
const info = () => screen.getByRole('button', { name: 'About Adaptive voice' })

beforeEach(() => {
  vi.clearAllMocks()
  h.updateUserSettings.mockResolvedValue(undefined)
  h.refetch.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('the person\'s Adaptive voice @SC-1834', () => {
  it('on: the switch is on, and one line says what the agent does now', () => {
    shown(true)
    render(<AdaptiveVoiceSection />)
    expect(screen.getByText('Adaptive voice')).toBeTruthy()
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/^On\. The agent makes listening sounds while you talk/)).toBeTruthy()
  })

  it('off: the switch is off, and the line says the agent is silent until its reply', () => {
    shown(false)
    render(<AdaptiveVoiceSection />)
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/^Off\. No listening sounds and no opening sentence/)).toBeTruthy()
  })

  it('turns it off and on for the person themselves', async () => {
    shown(true)
    render(<AdaptiveVoiceSection />)
    fireEvent.click(toggle())
    await waitFor(() => expect(h.updateUserSettings).toHaveBeenCalledWith({ adaptiveVoice: false }))
    cleanup()
    shown(false)
    render(<AdaptiveVoiceSection />)
    fireEvent.click(toggle())
    await waitFor(() => expect(h.updateUserSettings).toHaveBeenLastCalledWith({ adaptiveVoice: true }))
  })

  it('shows why a save was refused', async () => {
    shown(true)
    h.updateUserSettings.mockRejectedValue(new Error('Adaptive voice is on or off'))
    render(<AdaptiveVoiceSection />)
    fireEvent.click(toggle())
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Adaptive voice is on or off')
  })

  it('explains the baseline in its (i), the same in either state, and Escape closes it', () => {
    shown(false)
    render(<AdaptiveVoiceSection />)
    fireEvent.click(info())
    const box = screen.getByRole('dialog', { name: 'About Adaptive voice' })
    expect(box.textContent).toContain('Listening sounds')
    expect(box.textContent).toContain('Let me look into that')
    expect(box.textContent).toContain('stored standard phrase')
    expect(box.textContent).not.toContain('Enhanced')
    expect(box.textContent).not.toContain('your organisation')
    expect(box.textContent).toContain('the agent says nothing until its reply starts')
    expect(box.textContent).toContain('always on: noticing when you have finished')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
