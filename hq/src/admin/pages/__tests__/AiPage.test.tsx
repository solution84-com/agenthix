// @vitest-environment jsdom
/**
 * The AI page: its three sections, What agents can do first, each provider's line opening in place, what agents can do
 * with its Change and Add a key, the folded list, a link opening a provider's line, and the words. No test calls a vendor.
 */
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
    useQuery: (op: string) => ({ data: op === 'getFeatures' ? featuresAnswer() : h.data[op], error: undefined, refetch: async () => undefined }),
    useAction: (op: string) => (h.actions[op] ??= vi.fn().mockResolvedValue({})),
  }
})
vi.mock('../../../models-settings/components/ListEditor', () => ({ ListEditor: ({ intro }: { intro: string }) => <div>The list editor: {intro}</div> }))
vi.mock('../../../shared/components/models/ModelPicker', () => ({
  ModelPicker: ({ ariaLabel, buttonText, onChange }: { ariaLabel: string; buttonText: string; onChange: (v: string) => void }) => <button aria-label={ariaLabel} onClick={() => onChange('p1/claude-opus-5')}>{buttonText}</button>,
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { AiPage } from '../AiPage'
import { anthropic, assembly, assemblyWorks, cloud, custom, openrouter, settings } from './aiPageFixtures'

const show = (url = '/admin/ai') => render(<MemoryRouter initialEntries={[url]}><AiPage /></MemoryRouter>)
const act = (name: string) => (h.actions[name] ??= vi.fn().mockResolvedValue({}))
const line = (name: string) => within(screen.getByRole('listitem', { name }))
const providerLine = (name: string) => within(screen.getByRole('list', { name: 'Providers' })).getByRole('button', { name: new RegExp(`^${name}`) })
const openLine = (name: string) => fireEvent.click(providerLine(name))

beforeEach(() => { h.data = { getAiProviders: [anthropic, assembly, cloud, custom], getModelsSettings: settings, getWebSearchKeyStatus: { present: false } } })
afterEach(() => { cleanup(); h.data = {}; h.actions = {} })

describe('the AI page @SC-1178 @SC-2145 @SC-2146', () => {
  it('is called AI, and holds What agents can do, Your providers and Which models may run, in that order', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'AI' })).toBeTruthy()
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h2 => h2.textContent)
    expect(headings).toEqual(['What agents can do', 'Your providers', 'Which models may run'])
    expect(screen.getByRole('button', { name: 'Add a provider' })).toBeTruthy()
  })

  it('draws each provider as one line: name, kinds, runtime and state, closed', () => {
    show()
    expect(providerLine('Anthropic').textContent).toBe('AnthropicThinking · Claude CodeWorks')
    expect(providerLine('AssemblyAI').textContent).toBe('AssemblyAIHearingKey refused')
    for (const name of ['Anthropic', 'AssemblyAI', 'Agenthix Cloud', 'Our server']) expect(providerLine(name).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()
  })

  it('draws a provider that isn\'t working in the danger colour, and a working one quietly', () => {
    show()
    expect(document.getElementById('provider-p2')!.className).toContain('border-danger')
    expect(document.getElementById('provider-p1')!.className).not.toContain('danger')
  })

  it('opens a line in place into the card core: state with since when, the vendor message, runtime, key and what uses it', () => {
    show()
    openLine('Anthropic')
    const first = document.getElementById('provider-p1')!
    expect(first.textContent).toContain('Works. Since 12 Oct.')
    expect(first.textContent).toContain('Agents run its models on Claude Code')
    expect(first.textContent).toContain('key ending …a3f9')
    expect(first.textContent).toContain('Used by the default model')
    openLine('AssemblyAI')
    const refused = document.getElementById('provider-p2')!
    expect(refused.textContent).toContain('AssemblyAI says: invalid API key')
    expect(refused.textContent).toContain('Used by the default for Hearing')
    expect(refused.textContent).not.toContain('Agents run its models on')
    openLine('Our server')
    expect(screen.getByText('https://models.example.org/v1')).toBeTruthy()
    openLine('Agenthix Cloud')
    expect(within(document.getElementById('provider-p3')!).queryByRole('button', { name: /More about/ })).toBeNull()
  })

  it('keeps one line open at a time, and closes the open one when it is pressed again', () => {
    show()
    openLine('Anthropic')
    expect(providerLine('Anthropic').getAttribute('aria-expanded')).toBe('true')
    openLine('AssemblyAI')
    expect(providerLine('Anthropic').getAttribute('aria-expanded')).toBe('false')
    expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('button', { name: 'Check now' })).toHaveLength(1)
    openLine('AssemblyAI')
    expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()
  })

  it('keeps Settings\' tools on each opened line: Check now, History and the menu', async () => {
    show()
    openLine('Anthropic')
    const first = within(document.getElementById('provider-p1')!)
    expect(first.getByRole('button', { name: 'History' })).toBeTruthy()
    expect(first.getByRole('button', { name: 'More about Anthropic' })).toBeTruthy()
    fireEvent.click(first.getByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(act('checkAiProviderNow')).toHaveBeenCalledWith({ id: 'p1' }))
  })

  it('never draws a stored key: only its last four characters', () => {
    show()
    expect(document.body.innerHTML).not.toMatch(/sk-/)
    expect(document.querySelectorAll('input[type=password]').length).toBe(0)
  })

  it('says so when there are no providers', () => {
    h.data = { ...h.data, getAiProviders: [] }
    show()
    expect(screen.getByText(/No providers yet/)).toBeTruthy()
  })
})

describe('a link to the AI page @SC-1178 @SC-2147', () => {
  it('opens the provider\'s line it names, and marks only it', () => {
    show('/admin/ai#provider-p2')
    expect(document.getElementById('provider-p2')?.getAttribute('aria-current')).toBe('true')
    expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/AssemblyAI says: invalid API key/)).toBeTruthy()
    expect(document.getElementById('provider-p1')?.getAttribute('aria-current')).toBeNull()
    expect(providerLine('Anthropic').getAttribute('aria-expanded')).toBe('false')
  })

  it('Open its provider, on a default whose provider stopped working, opens that provider\'s line', async () => {
    h.data = { ...h.data, getModelsSettings: { ...settings, stt: { ...settings.stt, notWorking: true } } }
    show()
    expect(line('Hearing').getByText('Needs attention')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open its provider: Hearing' }))
    await waitFor(() => expect(document.getElementById('provider-p2')?.getAttribute('aria-current')).toBe('true'))
    expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true')
    // Closed, then Open its provider again: the address does not change, and the line opens all the same.
    openLine('AssemblyAI')
    fireEvent.click(screen.getByRole('button', { name: 'Open its provider: Hearing' }))
    await waitFor(() => expect(providerLine('AssemblyAI').getAttribute('aria-expanded')).toBe('true'))
  })

  it('scrolls to the line a link names once it is drawn', () => {
    const scrolled: string[] = []
    const was = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id) }
    try {
      show('/admin/ai#web-search')
      expect(scrolled).toContain('web-search')
    } finally {
      Element.prototype.scrollIntoView = was
    }
  })

  it('unfolds Which models may run when the link is to it', () => {
    show('/admin/ai#which-models-may-run')
    expect(screen.getByRole('button', { name: /Which models may run/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/The list editor: For everyone in Fernhill/)).toBeTruthy()
  })
})

describe('what agents can do, on the AI page @SC-2135 @SC-2136', () => {
  it('shows the four capabilities with what agents use', () => {
    show()
    expect(line('Thinking').getByText('Claude Sonnet 5 · via Anthropic')).toBeTruthy()
    expect(line('Hearing').getByText('Add a provider that hears people.')).toBeTruthy()
    expect(line('Speaking').getByText('Add a provider that speaks.')).toBeTruthy()
    expect(line('Web search').getByText('Some agents can search.')).toBeTruthy()
  })

  it('opens the page\'s Add a provider from a line that needs one', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Add a provider: Speaking' }))
    expect(screen.getByRole('list', { name: 'Providers to add' })).toBeTruthy()
  })

  it('saves a model chosen from Thinking\'s Change', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Change: Thinking' }))
    await waitFor(() => expect(act('setModelDefaults')).toHaveBeenCalledWith({ conversation: 'p1/claude-opus-5' }))
  })

  it('opens the hearing models from Hearing\'s Change and saves the one chosen on its provider', async () => {
    h.data = { ...h.data, getAiProviders: [anthropic, assemblyWorks] }
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Change: Hearing' }))
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.click(screen.getByRole('option', { name: /Multilingual/i }))
    await waitFor(() => expect(act('setModelDefaults')).toHaveBeenCalledWith({ stt: { providerId: 'p2', model: 'universal-streaming-multilingual' } }))
  })

  it('says a default that was not saved', async () => {
    act('setModelDefaults').mockRejectedValue(new Error('HQ did not answer'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Change: Thinking' }))
    expect(await screen.findByText('The default was not changed')).toBeTruthy()
  })

  it('opens Web search for OpenCode from Add a key when OpenCode is in use with no key @SC-2141', () => {
    h.data = { ...h.data, getAiProviders: [anthropic, openrouter] }
    show()
    expect(line('Web search').getByText('needs a search key')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add a key: Web search' }))
    expect(screen.getByRole('dialog', { name: 'Web search for OpenCode' })).toBeTruthy()
  })

  it('opens the same pop-up from Web search\'s Change once a key is saved, saying a key is saved', () => {
    h.data = { ...h.data, getAiProviders: [openrouter], getWebSearchKeyStatus: { present: true } }
    show()
    expect(line('Web search').getByText('Exa')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Change: Web search' }))
    expect(screen.getByText(/A key is saved/)).toBeTruthy()
  })
})

describe('which models may run, on the AI page @SC-2148 @SC-1202', () => {
  it('is folded, with its one line visible, and unfolds into the list editor', () => {
    show()
    const toggle = screen.getByRole('button', { name: /Which models may run/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText(/Any model your providers reach · 41 models/)).toBeTruthy()
    expect(screen.queryByText(/The list editor/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit the list' }))
    expect(screen.getByText(/The list editor: For everyone in Fernhill/)).toBeTruthy()
  })
})

describe('the words on the AI page @SC-2140', () => {
  it('names capabilities Thinking, Hearing and Speaking, never Voice, Listening, LLM, STT or TTS', () => {
    h.data = { ...h.data, getAiProviders: [anthropic, assembly, cloud, custom, openrouter] }
    show()
    // "Inworld TTS 2" is a model's own name, not a capability word.
    const text = (document.body.textContent ?? '').replace(/Inworld TTS 2/g, '')
    expect(text).not.toMatch(/\b(Voice|Listening|LLM|STT|TTS)\b/)
    expect(text).not.toMatch(/\bModels\b(?! and billing)/)
  })
})
