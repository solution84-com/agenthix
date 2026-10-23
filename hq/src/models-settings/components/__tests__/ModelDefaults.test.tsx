// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({ set: (() => Promise.resolve()) as (...a: unknown[]) => Promise<void>, result: { data: undefined as unknown, error: undefined as Error | undefined, refetch: vi.fn() } }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => state.result, useAction: () => state.set,
  getModelsSettings: {}, setModelDefaults: {}, setModelList: {},
}))
vi.mock('../../../conversations/components/ModelPicker', () => ({
  ModelPicker: ({ ariaLabel, labelOf, onChange }: { ariaLabel: string; labelOf: () => string; onChange: (v: string) => void }) => <button aria-label={ariaLabel} onClick={() => onChange('p1/claude-opus-5')}>{labelOf()}</button>,
}))
vi.mock('@agenthix/ui/primitives', () => ({
  Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />,
  NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} />,
  Modal: ({ open, children, title }: { open: boolean; children: React.ReactNode; title?: string }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
}))

import { ModelDefaults } from '../ModelDefaults'

afterEach(cleanup)

const data = {
  orgName: 'Fernhill', choices: { current: null, recent: [], models: [] },
  conversation: { providerId: 'p1', model: 'claude-sonnet-5', text: 'Claude Sonnet 5 · via Anthropic', notWorking: false },
  worker: null,
  stt: { providerId: 'a', model: 'u3-rt-pro', text: 'u3-rt-pro · via AssemblyAI', notWorking: false },
  tts: { providerId: 'i', model: 'inworld-tts-2', voice: 'Alistair', text: 'x', notWorking: false },
  stt_options: [{ providerId: 'a', name: 'AssemblyAI', state: 'works', models: ['u3-rt-pro'] }],
  tts_options: [{ providerId: 'i', name: 'Inworld', state: 'works', models: ['inworld-tts-2'] }],
  list: { owner: 'organisation', ownerId: 'o', mode: 'every', entries: [], reachable: 3, allowedAbove: 3, allowed: 3 },
  reachable: [],
}

describe('the organisation’s Models', () => {
  it('says it is loading', () => {
    state.result = { data: undefined, error: undefined, refetch: vi.fn() }
    render(<ModelDefaults />)
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('shows the server’s refusal', () => {
    state.result = { data: undefined, error: new Error('Only an organisation admin sets what models are used.'), refetch: vi.fn() }
    render(<ModelDefaults />)
    expect(screen.getByRole('alert').textContent).toContain('Only an organisation admin')
  })

  it('shows four settings, each in one line with a Change, and the list as one line with Edit', () => {
    state.result = { data, error: undefined, refetch: vi.fn() }
    render(<ModelDefaults />)
    expect(screen.getByText('Claude Sonnet 5 · via Anthropic')).toBeTruthy()
    expect(screen.getAllByText('Claude Sonnet 5 · via Anthropic')).toHaveLength(1)
    expect(screen.getByText(/^Alistair · Inworld TTS 2 · via Inworld/)).toBeTruthy()
    expect(screen.getByText(/^Universal-3 Pro, 32 languages · via AssemblyAI/)).toBeTruthy()
    expect(screen.getByText('Most accurate · $0.45 an hour')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change conversation' })).toBeTruthy()
    expect(screen.getByText('Not chosen')).toBeTruthy()
    expect(screen.getByText('Any model your providers reach · 3 models')).toBeTruthy()
    expect(screen.queryByText('For everyone in Fernhill. Agents, projects and people can narrow it further, never widen it.')).toBeNull()
  })

  it('opens the list editor behind Edit', () => {
    state.result = { data, error: undefined, refetch: vi.fn() }
    render(<ModelDefaults />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Which models may run' })).toBeTruthy()
    expect(screen.getByText('For everyone in Fernhill. Agents, projects and people can narrow it further, never widen it.')).toBeTruthy()
  })

  it('offers the three listening models and saves the one chosen on its provider', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    state.set = set
    state.result = { data, error: undefined, refetch: vi.fn() }
    render(<ModelDefaults />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[1])
    const select = screen.getByLabelText('Listening model')
    expect(select.querySelectorAll('option')).toHaveLength(3)
    fireEvent.change(select, { target: { value: 'universal-streaming-multilingual' } })
    await waitFor(() => expect(set).toHaveBeenCalledWith({ stt: { providerId: 'a', model: 'universal-streaming-multilingual' } }))
  })

  it('saves a model picked from Change', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    state.set = set
    state.result = { data, error: undefined, refetch: vi.fn() }
    render(<ModelDefaults />)
    fireEvent.click(screen.getByRole('button', { name: 'Change conversation' }))
    await waitFor(() => expect(set).toHaveBeenCalledWith({ conversation: 'p1/claude-opus-5' }))
  })
})
