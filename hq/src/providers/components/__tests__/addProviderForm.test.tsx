// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({ useAction: () => vi.fn(), addAiProvider: {} }))
vi.mock('@agenthix/ui/primitives', () => ({
  Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />,
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => <label>{label}<span>{hint}</span>{children}</label>,
}))

import { AddProviderForm, addableVendors } from '../AddProviderDialog'

afterEach(cleanup)

describe('one Inworld key for hearing and speaking @SC-1835', () => {
  it('lists Inworld first among speech-to-text vendors and says it hears and speaks', () => {
    expect(addableVendors('stt', [])).toEqual(['inworld', 'assemblyai'])
    render(<AddProviderForm type="stt" existingVendors={[]} onAdded={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Hearing and speaking: one key for both')).toBeTruthy()
    expect(screen.getByText('Hearing people')).toBeTruthy()
  })

  it('offers Inworld under text to speech with the same words, and says on the key form that one key covers both', () => {
    render(<AddProviderForm type="tts" existingVendors={[]} onAdded={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Hearing and speaking: one key for both')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Inworld/ }))
    expect(screen.getByText(/This one key covers hearing people and speaking for agents/)).toBeTruthy()
  })

  it('says nothing of the sort on AssemblyAI’s key form', () => {
    render(<AddProviderForm type="stt" existingVendors={[]} onAdded={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /AssemblyAI/ }))
    expect(screen.queryByText(/One key covers/)).toBeNull()
  })
})
