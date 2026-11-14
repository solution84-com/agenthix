// @vitest-environment jsdom
/** Setup's AI step in the board's four states, and the label that swaps from Skip for now to Continue. No test calls a vendor. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { AiProviderSummary } from '@agenthix/core'

const h = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, refetchDefaults: vi.fn(), refetchProviders: vi.fn(), remove: vi.fn(), saveKey: vi.fn(), refetchKey: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getSetupDefaults: 'getSetupDefaults', setModelDefaults: 'setModelDefaults', getHqCloudConnection: 'getHqCloudConnection',
  connectHqToCloud: 'connectHqToCloud', disconnectHqFromCloud: 'disconnectHqFromCloud', addAiProvider: 'addAiProvider',
  getAiProviderImpact: 'getAiProviderImpact', removeAiProvider: 'removeAiProvider',
  getWebSearchKeyStatus: 'getWebSearchKeyStatus', setWebSearchKey: 'setWebSearchKey', deleteWebSearchKey: 'deleteWebSearchKey',
  useAction: (fn: string) => (fn === 'removeAiProvider' ? h.remove : fn === 'setWebSearchKey' ? h.saveKey : vi.fn()),
  useQuery: (op: string) => ({ data: h.queries[op], error: undefined, refetch: op === 'getSetupDefaults' ? h.refetchDefaults : op === 'getWebSearchKeyStatus' ? h.refetchKey : vi.fn() }),
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
const providerLine = (name: string) => within(screen.getByRole('region', { name: 'Your providers' })).getByRole('button', { name: new RegExp(`^${name}`) })
const show = (providers: AiProviderSummary[], defaults: unknown = DEFAULTS, keyPresent = false) => {
  h.queries = { getSetupDefaults: defaults, getHqCloudConnection: CLOUD_OFF, getWebSearchKeyStatus: { present: keyPresent } }
  return render(
    <MemoryRouter>
      <AiStep position={{ step: 3, total: 4 }} side={<div />} providers={providers} onProvidersChanged={h.refetchProviders} onNext={onNext} onBack={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => { onNext.mockReset(); h.refetchDefaults.mockReset(); h.refetchProviders.mockReset(); h.remove.mockReset().mockResolvedValue({}); h.saveKey.mockReset().mockResolvedValue({ ok: true }); h.refetchKey.mockReset() })
afterEach(cleanup)

describe('the AI step @SC-1184', () => {
  it('A: with nothing added reads None yet, has the one Add a provider button, and Skip for now @SC-1842 @SC-1845', () => {
    show([], NONE)
    expect(screen.getByText(/^Step 3 of 4/)).toBeTruthy()
    expect(screen.getByText('None yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add a provider/ })).toBeTruthy()
    const list = within(screen.getByRole('region', { name: 'What agents can do' }))
    expect(list.getByText('Add a provider that offers models.')).toBeTruthy()
    expect(list.getByText('Comes with your first model provider.')).toBeTruthy()
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

  it('C: one provider that works shows its line, which opens into its state, runtime and Remove; the defaults with Change; and Continue @SC-1842 @SC-1844 @SC-1845', () => {
    show([base])
    expect(providerLine('Inworld').textContent).toBe('InworldThinking, Hearing, Speaking · OpenCodeWorks')
    expect(screen.queryByRole('button', { name: 'Remove Inworld' })).toBeNull()
    fireEvent.click(providerLine('Inworld'))
    const card = within(document.getElementById('provider-p')!)
    expect(card.getByText(/Works\. Added by you\./)).toBeTruthy()
    expect(card.getByText('Agents run its models on')).toBeTruthy()
    expect(card.getByRole('button', { name: 'Remove Inworld' })).toBeTruthy()
    expect(screen.getByText('Claude Sonnet 5.5 · via Inworld')).toBeTruthy()
    expect(screen.queryByText('Not chosen yet.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('keeps setup\'s order, the providers then what agents can do, and one line open at a time', () => {
    show([base, assembly])
    const providers = screen.getByRole('region', { name: 'Your providers' })
    expect(providers.compareDocumentPosition(screen.getByRole('region', { name: 'What agents can do' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(providerLine('Inworld'))
    fireEvent.click(providerLine('AssemblyAI'))
    expect(providerLine('Inworld').getAttribute('aria-expanded')).toBe('false')
    expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1)
    fireEvent.click(providerLine('AssemblyAI'))
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('D: only a hearing provider leaves thinking and speaking as a note, with what to add, and Continue is there @SC-1844 @SC-1845', () => {
    show([assembly], { ...DEFAULTS, conversation: null, tts: null, tts_options: [] })
    expect(screen.getByText('Add a provider that offers models.')).toBeTruthy()
    expect(screen.getByText('Add a provider that speaks.')).toBeTruthy()
    expect(screen.queryByText(/outage|down/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(providerLine('AssemblyAI').textContent).toBe('AssemblyAIHearingWorks')
  })

  it('keeps Skip for now while the only provider does not work, and says why in words @SC-1845', () => {
    show([{ ...base, state: 'key_refused', stateDetail: 'invalid key' }])
    expect(providerLine('Inworld').textContent).toContain('Key refused')
    expect(document.getElementById('provider-p')!.className).toContain('border-danger')
    fireEvent.click(providerLine('Inworld'))
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

  it('confirms a removal as Manage organisation › AI does, then reads the list again @SC-1842', async () => {
    h.queries = { getSetupDefaults: DEFAULTS, getHqCloudConnection: CLOUD_OFF, getAiProviderImpact: { provider: { id: 'p', name: 'Inworld' }, defaults: [], agents: [], goesDown: ['llm'] } }
    render(
      <MemoryRouter>
        <AiStep position={{ step: 3, total: 4 }} side={<div />} providers={[base]} onProvidersChanged={h.refetchProviders} onNext={onNext} onBack={vi.fn()} />
      </MemoryRouter>,
    )
    fireEvent.click(providerLine('Inworld'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Inworld' }))
    expect(screen.getByText('Remove Inworld?')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledWith({ id: 'p' }))
    await vi.waitFor(() => expect(h.refetchProviders).toHaveBeenCalled())
  })

  it('lists Thinking, Hearing, Speaking and Web search, and says OpenCode needs a key', () => {
    show([base])
    const list = within(screen.getByRole('region', { name: 'What agents can do' }))
    for (const name of ['Thinking', 'Hearing', 'Speaking', 'Web search']) expect(list.getByRole('listitem', { name })).toBeTruthy()
    expect(list.getByText('OpenCode needs a search key.')).toBeTruthy()
    expect(list.getByRole('button', { name: 'Add a key: Web search' })).toBeTruthy()
  })

  it('Change opens the default picker under its line', () => {
    show([base])
    fireEvent.click(screen.getByRole('button', { name: 'Change: Speaking' }))
    const line = within(screen.getByRole('listitem', { name: 'Speaking' }))
    expect(line.getByRole('button', { name: 'Done' })).toBeTruthy()
    fireEvent.click(line.getByRole('button', { name: 'Done' }))
    expect(line.queryByRole('button', { name: 'Done' })).toBeNull()
  })

  it('a key added in setup is saved through the pop-up, the list is read again, and Continue stays', async () => {
    show([base])
    fireEvent.click(screen.getByRole('button', { name: 'Add a key: Web search' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Web search for OpenCode' }))
    fireEvent.change(dialog.getByLabelText(/Exa API key/), { target: { value: 'exa-1' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save key' }))
    await vi.waitFor(() => expect(h.saveKey).toHaveBeenCalledWith({ secret: 'exa-1' }))
    await vi.waitFor(() => expect(h.refetchKey).toHaveBeenCalled())
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Web search for OpenCode' })).toBeNull())
  })

  it('a refused key stays in the pop-up and does not block setup', async () => {
    h.saveKey.mockRejectedValue(Object.assign(new Error('That key was refused'), { statusCode: 400 }))
    show([base])
    fireEvent.click(screen.getByRole('button', { name: 'Add a key: Web search' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Web search for OpenCode' }))
    fireEvent.change(dialog.getByLabelText(/Exa API key/), { target: { value: 'bad' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save key' }))
    expect(await dialog.findByText('That key was refused')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Web search for OpenCode' })).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Not now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('a default whose provider stopped is marked ! and Open its provider opens and marks that provider’s line', () => {
    const scrolled: string[] = []
    const was = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id) }
    try {
      show([base, { ...assembly, state: 'key_refused' }], { ...DEFAULTS, stt: { ...choice('a', 'Universal · via AssemblyAI'), notWorking: true } })
      const list = within(screen.getByRole('region', { name: 'What agents can do' }))
      expect(list.getByText('Needs attention')).toBeTruthy()
      expect(list.getByText('Universal · via AssemblyAI: its provider isn’t working.')).toBeTruthy()
      expect(document.getElementById('provider-a')?.getAttribute('aria-current')).toBeNull()
      fireEvent.click(list.getByRole('button', { name: 'Open its provider: Hearing' }))
      expect(document.getElementById('provider-a')?.getAttribute('aria-current')).toBe('true')
      expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true')
      expect(document.getElementById('provider-p')?.getAttribute('aria-current')).toBeNull()
      expect(scrolled).toEqual(['provider-a'])
      // Closed, then pressed again: the line opens again.
      fireEvent.click(providerLine('AssemblyAI'))
      fireEvent.click(list.getByRole('button', { name: 'Open its provider: Hearing' }))
      expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true')
      expect(scrolled).toEqual(['provider-a', 'provider-a'])
    } finally {
      Element.prototype.scrollIntoView = was
    }
  })

  it('web search never changes Continue or Skip for now', () => {
    show([base], DEFAULTS, false)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    cleanup()
    show([base], DEFAULTS, true)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.queryByText('OpenCode needs a search key.')).toBeNull()
    cleanup()
    show([], NONE, false)
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy()
    cleanup()
    show([], NONE, true)
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })
})
