// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fakeClock } from '../../clock'
import { VOICE_SETTINGS } from '../../settings'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VoiceLab } from '../VoiceLab'
import { serializeLog } from '../log'

afterEach(cleanup)

const make = () => createVoiceRuntime({ components: [], adapters: [], settings: VOICE_SETTINGS, clock: fakeClock() })

describe('VoiceLab', () => {
  it('says voice is off, and shows every row as no events yet', () => {
    render(<VoiceLab runtime={null} />)
    expect(screen.getByText('Voice is off')).toBeTruthy()
    expect(screen.getAllByText('no events yet').length).toBe(5)
  })

  it('shows a live runtime as its events arrive', async () => {
    const runtime = make()
    render(<VoiceLab runtime={runtime} />)
    act(() => {
      runtime.publish({ kind: 'acoustic.silence', silent: true, t: 1 })
      runtime.publish({ kind: 'stt.words', text: 'good morning', words: [], committed: true, order: 0, t: 2 })
      runtime.publish({ kind: 'orchestration.floor', state: 'person-speaking', t: 3 })
    })
    await waitFor(() => expect(screen.getByText('Silent')).toBeTruthy())
    expect(screen.getByText(/good morning/)).toBeTruthy()
    expect(screen.getByText('person-speaking')).toBeTruthy()
    expect(screen.getAllByText('no events yet').length).toBe(2)
  })

  it('loads a saved log to look at, and says why a bad file is refused', async () => {
    const runtime = make()
    runtime.publish({ kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model', t: 5 })
    const text = serializeLog(runtime.log(), runtime.overflows(), 1)
    const { container } = render(<VoiceLab runtime={null} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = (body: string) => new File([body], 'log.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file('nope')] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not JSON'))
    fireEvent.change(input, { target: { files: [file(text)] } })
    await waitFor(() => expect(screen.getByText('Saved log, 1 events')).toBeTruthy())
    expect(screen.getByText('READY')).toBeTruthy()
  })
})

describe('VoiceLabPage in a production build', () => {
  it('shows one line', async () => {
    vi.stubEnv('DEV', false)
    vi.doMock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
    vi.doMock('../../../../shared/providers/VoiceCallProvider', () => ({ useVoiceCall: () => ({ voice: { phase: 'off' } }) }))
    const { VoiceLabPage } = await import('../VoiceLabPage')
    render(<VoiceLabPage />)
    expect(screen.getByText('The voice lab exists only in development builds.')).toBeTruthy()
    vi.unstubAllEnvs()
  })
})
