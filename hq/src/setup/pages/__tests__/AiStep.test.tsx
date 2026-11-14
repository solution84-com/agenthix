// @vitest-environment jsdom
/** Setup's AI step in the board's four states, and the label that swaps from Skip for now to Continue. No test calls a vendor. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { AiProviderSummary } from '@agenthix/core'

const h = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, refetchDefaults: vi.fn(), refetchProviders: vi.fn(), remove: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getSetupDefaults: 'getSetupDefaults', setModelDefaults: 'setModelDefaults', getHqCloudConnection: 'getHqCloudConnection',
  connectHqToCloud: 'connectHqToCloud', disconnectHqFromCloud: 'disconnectHqFromCloud', addAiProvider: 'addAiProvider',
  getAiProviderImpact: 'getAiProviderImpact', removeAiProvider: 'removeAiProvider',
  useAction: (fn: string) => (fn === 'removeAiProvider' ? h.remove : vi.fn()),
  useQuery: (op: string) => ({ data: h.queries[op], error: undefined, refetch: op === 'getSetupDefaults' ? h.refetchDefaults : vi.fn() }),
}))
vi.mock('../../../features/useFeature', async () => {
  const { isFeatureOn } = await import('@agenthix/core')
  return { useFeature: (flag: Parameters<typeof isFeatureOn>[0]) => isFeatureOn(flag, { env: process.env, switches: {} }) }
})

import { AiStep } from '../steps/AiStep'
import { withFeature } from '@agenthix/core/testing'

const CLOUD_OFF = { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false }
const choice = (providerId: string, text: string) => ({ providerId, model: 'm', text, notWorking: false })
const DEFAULTS = {
  orgName: 'Acme', choices: { current: null, recent: [], models: [] },
  conversation: choice('inworld', 'Claude Sonnet 5.5 · via Inworld'),
  stt: choice('inworld', 'inworld-stt · via Inworld'),
  tts: { ...choice('inworld', 'inworld-tts-2 · Alistair · via Inworld'), voice: 'Alistair' },
  stt_options: [{ providerId: 'inworld', name: 'Inworld', state: 'works', models: [] }],
  tts_options: [{ providerId: 'inworld', name: 'Inworld', state: 'works', models: ['inworld-tts-2'] }],
}
const NONE = { ...DEFAULTS, conversation: null, stt: null, tts: null, stt_options: [], tts_options: [] }
const base: AiProviderSummary = {
  id: 'p', name: 'Inworld', vendor: 'inworld', types: ['llm', 'stt', 'tts'], credential: 'api_key', baseUrl: null, keyHint: 'a3f9',
  state: 'works', stateSince: '2026-10-12T09:00:00Z', stateDetail: null, lastCheckedAt: null, lastWorkedAt: null,
  usedBy: { defaults: [], agents: [] }, costThisMonth: [], createdAt: '2026-10-12T09:00:00Z',
}
const assembly: AiProviderSummary = { ...base, id: 'a', name: 'AssemblyAI', vendor: 'assemblyai', types: ['stt'] }

const onNext = vi.fn()
const show = (providers: AiProviderSummary[], defaults: unknown = DEFAULTS) => {
  h.queries = { getSetupDefaults: defaults, getHqCloudConnection: CLOUD_OFF }
  return render(
    <MemoryRouter>
      <AiStep position={{ step: 3, total: 4 }} side={<div />} providers={providers} onProvidersChanged={h.refetchProviders} onNext={onNext} onBack={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => { onNext.mockReset(); h.refetchDefaults.mockReset(); h.refetchProviders.mockReset(); h.remove.mockReset().mockResolvedValue({}) })
afterEach(cleanup)

describe('the AI step @SC-1184', () => {
  it('A: with nothing added reads None yet, has the one Add a provider button, and Skip for now @SC-1842 @SC-1845', () => {
    show([], NONE)
    expect(screen.getByText(/^Step 3 of 4/)).toBeTruthy()
    expect(screen.getByText('None yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add a provider/ })).toBeTruthy()
    expect(screen.getByText('Model, hearing and speaking. Chosen for you once a provider is added.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('B: the button opens the pop-up listing the vendors directly, and no Agenthix Cloud while its flag is off @SC-1843 @SC-2124', () => {
    show([], NONE)
    fireEvent.click(screen.getByRole('button', { name: /Add a provider/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    const list = within(screen.getByRole('list', { name: 'Providers to add' }))
    for (const name of ['Anthropic', 'OpenAI', 'Google Gemini', 'OpenRouter', 'Inworld', 'AssemblyAI', 'Your own OpenAI-compatible endpoint']) {
      expect(list.getByText(name)).toBeTruthy()
    }
    expect(list.queryByText('Agenthix Cloud')).toBeNull()
    expect(screen.queryByText(/What does the provider do/)).toBeNull()
    fireEvent.click(list.getByRole('button', { name: /^Anthropic/ }))
    expect(screen.getByText('Where do I get an Anthropic key?')).toBeTruthy()
  })

  withFeature('cloud', () => {
    it('B: with Agenthix Cloud on, it is an entry, not available yet @SC-1843', () => {
      show([], NONE)
      fireEvent.click(screen.getByRole('button', { name: /Add a provider/ }))
      const list = within(screen.getByRole('list', { name: 'Providers to add' }))
      expect(list.getByText('Agenthix Cloud')).toBeTruthy()
      expect(list.getByText('Not available yet')).toBeTruthy()
    })
  })

  it('C: one provider that works shows its card with chips, its state and Remove, the defaults with Change, and Continue @SC-1842 @SC-1844 @SC-1845', () => {
    show([base])
    const card = within(screen.getByText('Inworld', { selector: 'span' }).closest('li')!)
    for (const chip of ['Models', 'Hearing', 'Speaking']) expect(card.getByText(chip)).toBeTruthy()
    expect(card.getByText(/Works\. Added by you\./)).toBeTruthy()
    expect(card.getByRole('button', { name: 'Remove Inworld' })).toBeTruthy()
    expect(screen.getByText('Claude Sonnet 5.5 · via Inworld')).toBeTruthy()
    expect(screen.getAllByText('Hearing')).toHaveLength(2) // the chip and the row
    expect(screen.getAllByText('Speaking')).toHaveLength(2)
    expect(screen.queryByText(/^Not set\./)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('D: only a hearing provider leaves model and speaking Not set, with what to add, and Continue is there @SC-1844 @SC-1845', () => {
    show([assembly], { ...DEFAULTS, conversation: null, tts: null, tts_options: [] })
    expect(screen.getByText('Not set. Add a provider that offers models.')).toBeTruthy()
    expect(screen.getByText('Not set. Add a provider that speaks.')).toBeTruthy()
    expect(screen.queryByText(/outage|down/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(within(screen.getByText('AssemblyAI', { selector: 'span' }).closest('li')!).queryByText('Models')).toBeNull()
  })

  it('keeps Skip for now while the only provider does not work, and says why in words @SC-1845', () => {
    show([{ ...base, state: 'key_refused', stateDetail: 'invalid key' }])
    expect(screen.getByText(/The key was refused\. Inworld says: invalid key/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('reads the defaults again when a provider is added @SC-1844', () => {
    const { rerender } = show([])
    rerender(
      <MemoryRouter>
        <AiStep position={{ step: 3, total: 4 }} side={<div />} providers={[base]} onProvidersChanged={h.refetchProviders} onNext={onNext} onBack={vi.fn()} />
      </MemoryRouter>,
    )
    expect(h.refetchDefaults).toHaveBeenCalledTimes(1)
  })

  it('confirms a removal as Manage › Providers does, then reads the list again @SC-1842', async () => {
    h.queries = { getSetupDefaults: DEFAULTS, getHqCloudConnection: CLOUD_OFF, getAiProviderImpact: { provider: { id: 'p', name: 'Inworld' }, defaults: [], agents: [], goesDown: ['llm'] } }
    render(
      <MemoryRouter>
        <AiStep position={{ step: 3, total: 4 }} side={<div />} providers={[base]} onProvidersChanged={h.refetchProviders} onNext={onNext} onBack={vi.fn()} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Inworld' }))
    expect(screen.getByText('Remove Inworld?')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledWith({ id: 'p' }))
    await vi.waitFor(() => expect(h.refetchProviders).toHaveBeenCalled())
  })
})
