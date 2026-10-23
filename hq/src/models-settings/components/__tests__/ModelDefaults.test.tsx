// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({ result: { data: undefined as unknown, error: undefined as Error | undefined, refetch: vi.fn() } }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => state.result, useAction: () => vi.fn(),
  getModelsSettings: {}, setModelDefaults: {}, setModelList: {},
}))
vi.mock('../../../conversations/components/ModelPicker', () => ({
  ModelPicker: ({ ariaLabel }: { ariaLabel: string }) => <button>{ariaLabel}</button>,
}))
vi.mock('@agenthix/ui/primitives', () => ({
  Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />,
  NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} />,
  Modal: () => null,
}))

import { ModelDefaults } from '../ModelDefaults'

afterEach(cleanup)

const data = {
  orgName: 'Fernhill', choices: { current: null, recent: [], models: [] },
  conversation: { providerId: 'p1', model: 'claude-sonnet-5', text: 'Claude Sonnet 5 · via Anthropic', notWorking: false },
  worker: null, stt: null, tts: null,
  stt_options: [{ providerId: 'a', name: 'AssemblyAI', state: 'works', models: ['u3-rt-pro'] }],
  tts_options: [],
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

  it('shows the defaults, the voice defaults and the list', () => {
    state.result = { data, error: undefined, refetch: vi.fn() }
    render(<ModelDefaults />)
    expect(screen.getByRole('button', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('Claude Sonnet 5 · via Anthropic')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Workers' })).toBeTruthy()
    expect(screen.getByLabelText('Speech to text provider')).toBeTruthy()
    expect(screen.getByText('For everyone in Fernhill. Agents, projects and people can narrow it further, never widen it.')).toBeTruthy()
  })
})
