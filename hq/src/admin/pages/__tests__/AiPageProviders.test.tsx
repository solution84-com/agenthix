// @vitest-environment jsdom
/** The AI page's providers: adding one, Agenthix Cloud, and each line's dialogs. No test calls a vendor. */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// ui resolves its own copy of lucide-react (see boardColumnsView.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => ({ ...(await importOriginal<object>()), MoreHorizontal: () => null }))

const h = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  actions: {} as Record<string, ReturnType<typeof vi.fn>>,
}))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../../test/featuresAnswer')
  const names = ['getFeatures', 'getAiProviders', 'getAiProviderRecords', 'getAiProviderImpact', 'addAiProvider', 'replaceAiProviderKey', 'renameAiProvider', 'removeAiProvider', 'revokeAiProvider', 'checkAiProviderNow', 'getHqCloudConnection', 'connectHqToCloud', 'disconnectHqFromCloud', 'getModelsSettings', 'getWebSearchKeyStatus', 'setModelDefaults', 'setModelList', 'setWebSearchKey', 'deleteWebSearchKey']
  return {
    ...Object.fromEntries(names.map(n => [n, n])),
    useQuery: (op: string) => ({ data: op === 'getFeatures' ? featuresAnswer() : h.data[op], error: undefined }),
    useAction: (op: string) => (h.actions[op] ??= vi.fn().mockResolvedValue({})),
  }
})
vi.mock('../../../models-settings/components/ListEditor', () => ({ ListEditor: ({ intro }: { intro: string }) => <div>The list editor: {intro}</div> }))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { AiPage } from '../AiPage'
import { withFeature } from '@agenthix/core/testing'
import { anthropic as base, assembly, cloud, custom, settings } from './aiPageFixtures'

const show = (url = '/admin/ai') => render(<MemoryRouter initialEntries={[url]}><AiPage /></MemoryRouter>)
const act = (name: string) => (h.actions[name] ??= vi.fn().mockResolvedValue({}))
const openMenu = (provider: string, item: string) => {
  fireEvent.click(screen.getByRole('button', { name: `More about ${provider}` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

beforeEach(() => { h.data = { getAiProviders: [base, assembly, cloud, custom], getModelsSettings: settings, getWebSearchKeyStatus: { present: false } } })
afterEach(() => { cleanup(); h.data = {}; h.actions = {} })

describe('adding a provider on the AI page @SC-1170 @SC-1178 @SC-1843', () => {
  it('lists the vendors directly, then asks for the key, and offers only vendors not yet added', async () => {
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
    expect(screen.queryByText('What does the provider do?')).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Providers to add' })).queryByText('Anthropic')).toBeNull()
    fireEvent.click(screen.getByText('OpenAI'))
    const key = screen.getByLabelText('API key') as HTMLInputElement
    expect(key.type).toBe('password')
    fireEvent.change(key, { target: { value: 'sk-test-fake-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(act('addAiProvider')).toHaveBeenCalledWith({ vendor: 'openai', key: 'sk-test-fake-key' }))
  })

  it('asks for the address of a custom endpoint and sends it', async () => {
    h.data = { ...h.data, getAiProviders: [base] }
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
    fireEvent.click(screen.getByText('Your own OpenAI-compatible endpoint'))
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'https://x.example/v1' } })
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test-fake-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(act('addAiProvider')).toHaveBeenCalledWith({ vendor: 'openai_compatible', key: 'sk-test-fake-key', baseUrl: 'https://x.example/v1' }))
  })

  it('saves a custom endpoint with no key, which the server accepts', async () => {
    h.data = { ...h.data, getAiProviders: [base] }
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
    fireEvent.click(screen.getByText('Your own OpenAI-compatible endpoint'))
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'http://host.docker.internal:11434/v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(act('addAiProvider')).toHaveBeenCalledWith({ vendor: 'openai_compatible', key: '', baseUrl: 'http://host.docker.internal:11434/v1' }))
  })

  it('shows the vendor’s reason under the key field when it refuses', async () => {
    act('addAiProvider').mockRejectedValue(new Error('OpenAI refused this key: invalid x-api-key'))
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
    fireEvent.click(screen.getByText('OpenAI'))
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test-fake-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('OpenAI refused this key: invalid x-api-key')).toBeTruthy()
  })
})

describe('the other dialogs @SC-1173 @SC-1174', () => {
  it('replaces a key without showing the old one', async () => {
    show()
    openMenu('Anthropic', 'Replace key')
    expect(screen.getByText(/^Now: key ending/).textContent).toContain('\u2026a3f9')
    expect((screen.getByLabelText('New API key') as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('New API key'), { target: { value: 'sk-test-fake-new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(act('replaceAiProviderKey')).toHaveBeenCalledWith({ id: 'p1', key: 'sk-test-fake-new' }))
  })

  it('renames', async () => {
    show()
    openMenu('Anthropic', 'Rename')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Anthropic (team)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(act('renameAiProvider')).toHaveBeenCalledWith({ id: 'p1', name: 'Anthropic (team)' }))
  })

  it('shows what falls to what before a removal is confirmed', async () => {
    h.data.getAiProviderImpact = { provider: { id: 'p1', name: 'Anthropic' }, defaults: [{ slot: 'conversation', to: { id: 'p3', name: 'Agenthix Cloud' } }], agents: [], goesDown: [] }
    show()
    openMenu('Anthropic', 'Remove')
    expect(screen.getByText('The default model falls to Agenthix Cloud, the next allowed, until you choose.')).toBeTruthy()
    expect(act('removeAiProvider')).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(act('removeAiProvider')).toHaveBeenCalledWith({ id: 'p1' }))
  })

  it('removes the last of a type after saying it goes down until another is added', async () => {
    h.data.getAiProviderImpact = { provider: { id: 'p2', name: 'AssemblyAI' }, defaults: [], agents: [], goesDown: ['stt'] }
    show()
    openMenu('AssemblyAI', 'Remove')
    expect(screen.getByText('Agents will not hear people until you add another provider that does.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(act('removeAiProvider')).toHaveBeenCalledWith({ id: 'p2' }))
  })

  it('revokes with its warning, even for the last of a type', async () => {
    h.data.getAiProviderImpact = { provider: { id: 'p2', name: 'AssemblyAI' }, defaults: [{ slot: 'stt', to: null }], agents: [], goesDown: ['stt'] }
    show()
    openMenu('AssemblyAI', 'Revoke now')
    expect(screen.getByText(/Revoke the key at AssemblyAI too: HQ cannot/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke now' }))
    await waitFor(() => expect(act('revokeAiProvider')).toHaveBeenCalledWith({ id: 'p2' }))
  })

  it('offers no Agenthix Cloud while its flag is off, on the page or in the Add provider dialog (adr-0189) @SC-2124', () => {
    h.data = { ...h.data, getAiProviders: [base], getHqCloudConnection: { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: true } }
    show()
    expect(screen.queryByRole('button', { name: /Agenthix Cloud/ })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
    expect(screen.queryByRole('button', { name: /^Agenthix Cloud/ })).toBeNull()
    expect(screen.getByRole('list', { name: 'Providers to add' }).textContent).not.toContain('Cloud')
  })

  withFeature('cloud', () => {
    it('connects Agenthix Cloud from the page, and from the Add provider dialog @SC-1179', () => {
      h.data = { ...h.data, getAiProviders: [base], getHqCloudConnection: { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false } }
      show()
      fireEvent.click(screen.getByRole('button', { name: 'Connect Agenthix Cloud' }))
      expect(screen.getByLabelText('Agenthix Cloud connection')).toBeTruthy()
      cleanup()
      h.data = { ...h.data, getAiProviders: [base], getHqCloudConnection: { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false } }
      show()
      fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
      expect((screen.getByRole('button', { name: /^Agenthix Cloud/ }) as HTMLButtonElement).disabled).toBe(true)
      cleanup()
      h.data = { ...h.data, getAiProviders: [base], getHqCloudConnection: { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: true } }
      show()
      fireEvent.click(screen.getAllByRole('button', { name: 'Add a provider' })[0])
      fireEvent.click(screen.getByRole('button', { name: /^Agenthix Cloud/ }))
      expect(screen.getByLabelText('Agenthix Cloud connection')).toBeTruthy()
    })
  })

  withFeature('cloud', () => {
    it('reads Agenthix Cloud… once it is connected', () => {
      show()
      expect(screen.getByRole('button', { name: 'Agenthix Cloud…' })).toBeTruthy()
    })
  })
})
