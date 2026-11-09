// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@agenthix/ui/primitives', () => ({
  NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} />,
}))

import { ListeningRow } from '../ListeningRow'
import { INWORLD_LISTENING_MODEL } from '../../../voice/voiceModels'

afterEach(cleanup)

const assembly = { providerId: 'a', name: 'AssemblyAI', state: 'works' as const, models: ['universal-3-6-pro', 'universal-streaming-english', 'universal-streaming-multilingual'] }
const inworld = { providerId: 'i', name: 'Inworld', state: 'works' as const, models: [INWORLD_LISTENING_MODEL] }
const choice = (providerId: string, model: string) => ({ providerId, model, text: model, notWorking: false })

describe('the Listening row switches provider @SC-1835', () => {
  it('offers every working provider’s models in the one list and saves the provider that serves the one chosen', () => {
    const onChange = vi.fn()
    render(<ListeningRow options={[assembly, inworld]} own={null} shown={choice('a', 'universal-3-6-pro')} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const select = screen.getByLabelText('Listening model')
    expect(select.querySelectorAll('option')).toHaveLength(4)
    fireEvent.change(select, { target: { value: INWORLD_LISTENING_MODEL } })
    expect(onChange).toHaveBeenCalledWith({ providerId: 'i', model: INWORLD_LISTENING_MODEL })
  })

  it('names the provider beside each model once there is more than one', () => {
    render(<ListeningRow options={[assembly, inworld]} own={null} shown={choice('a', 'universal-3-6-pro')} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('option', { name: /Inworld STT 1.*via Inworld/ })).toBeTruthy()
  })

  it('leaves out a provider that is not working', () => {
    render(<ListeningRow options={[assembly, { ...inworld, state: 'key_refused' as const }]} own={null} shown={choice('a', 'universal-3-6-pro')} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText('Listening model').querySelectorAll('option')).toHaveLength(3)
  })

  it('says in plain words what Inworld costs in quality and recommends AssemblyAI, only while Inworld is shown', () => {
    const { rerender } = render(<ListeningRow options={[assembly, inworld]} own={null} shown={choice('i', INWORLD_LISTENING_MODEL)} onChange={vi.fn()} />)
    const note = screen.getByText(/recommend AssemblyAI for quality/i)
    expect(note.textContent).toMatch(/digits/)
    expect(note.textContent).toMatch(/our tests of clear English speech/)
    expect(note.textContent).not.toMatch(/waits/)
    expect(note.textContent?.length).toBeLessThan(160)
    rerender(<ListeningRow options={[assembly, inworld]} own={null} shown={choice('a', 'universal-3-6-pro')} onChange={vi.fn()} />)
    expect(screen.queryByText(/recommend AssemblyAI for quality/i)).toBeNull()
  })
})
