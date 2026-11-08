// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({ set: vi.fn(), data: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: state.data, error: undefined, refetch: vi.fn() }), useAction: () => state.set,
  getAgentModels: {}, setAgentModels: {}, setModelList: {},
}))
vi.mock('../../../shared/components/models/ModelPicker', () => ({
  ModelPicker: ({ ariaLabel, buttonText }: { ariaLabel: string; buttonText: string }) => <button aria-label={ariaLabel}>{buttonText}</button>,
}))
vi.mock('@agenthix/ui/primitives', () => ({
  Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />,
  NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} />,
  Modal: () => null,
}))

import { AgentModels } from '../AgentModels'

afterEach(cleanup)

const choice = (text: string, model = 'm') => ({ providerId: 'p1', model, text, notWorking: false })
const data = {
  orgName: 'Fernhill', choices: { current: null, recent: [], models: [] },
  conversation: choice('Claude Haiku 4.5 · via Anthropic', 'claude-haiku-4-5'), stt: null, tts: null,
  orgConversation: choice('Claude Sonnet 5 · via Anthropic'),
  orgStt: { providerId: 'a', model: 'u3-rt-pro', text: 'x', notWorking: false },
  orgTts: { providerId: 'i', model: 'inworld-tts-2', voice: 'Alistair', text: 'x', notWorking: false },
  stt_options: [{ providerId: 'a', name: 'AssemblyAI', state: 'works', models: [] }],
  tts_options: [{ providerId: 'i', name: 'Inworld', state: 'works', models: [] }],
  list: { owner: 'agent', ownerId: 'ag', mode: 'every', entries: [], reachable: 3, allowedAbove: 3, allowed: 3 }, reachable: [],
}

describe('an agent’s Models @SC-1201', () => {
  it('says whose each setting is, and offers to give the agent its own or to follow the organisation', async () => {
    state.data = data
    render(<AgentModels agentId="ag" agentName="Kernel" />)
    expect(screen.getByText('Claude Haiku 4.5 · via Anthropic')).toBeTruthy()
    expect(screen.getAllByText("· Fernhill's")).toHaveLength(2)
    expect(screen.getByText("· Kernel's own")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change model' }).textContent).toBe('Change')
    expect(screen.queryByText('Workers')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Follow Fernhill' }))
    await waitFor(() => expect(state.set).toHaveBeenCalledWith({ agentId: 'ag', conversation: null }))
  })
})
