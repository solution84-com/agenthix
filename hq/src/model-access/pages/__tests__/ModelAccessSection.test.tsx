// @vitest-environment jsdom
/**
 * Model access at the org, a person and a project: what is set is listed, one
 * "Add model access" menu offers what is not, and choosing an item opens a
 * dialog for it. The status queries are held in `held`, so saving lists a key.
 */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'

type Args = { ownerType: string; ownerId: string; kind: 'API_KEY' | 'SUBSCRIPTION'; provider: string }

const h = vi.hoisted(() => ({ held: new Set<string>(), unusable: false, setModelCredential: vi.fn(), deleteModelCredential: vi.fn(), startClaudeLogin: vi.fn(), signedIn: vi.fn() }))

vi.mock('wasp/client/operations', () => ({
  useQuery: (_op: unknown, a: Args) => {
    const [, tick] = React.useState(0)
    const key = `${a.ownerType}:${a.kind === 'SUBSCRIPTION' ? 'subscription' : a.provider}`
    return { data: { present: h.held.has(key), usable: !(h.unusable && a.kind === 'SUBSCRIPTION') }, isLoading: false, refetch: () => tick(t => t + 1) }
  },
  useAction: (fn: unknown) => fn,
  getModelCredentialStatus: 'getModelCredentialStatus',
  setModelCredential: h.setModelCredential,
  deleteModelCredential: h.deleteModelCredential,
  startClaudeLogin: h.startClaudeLogin,
  completeClaudeLogin: vi.fn(),
  cancelClaudeLogin: vi.fn(),
}))

import { ModelAccessSection } from '../ModelAccessSection'

const LINES: Record<string, string> = {
  'Claude subscription': 'Claude models, on your Claude account · yours, for your own runs',
  'Anthropic API key': 'Claude models',
  OpenRouter: 'Many models, free ones included',
  OpenAI: 'GPT models',
  'Google Gemini': 'Gemini models',
  'Your own endpoint': 'Any OpenAI-compatible server',
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Add model access/ }))
const items = () => screen.getAllByRole('menuitem').map(i => i.textContent ?? '')

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  h.held = new Set()
  h.unusable = false
  h.setModelCredential.mockImplementation(async (a: { ownerType: string; provider: string }) => { h.held.add(`${a.ownerType}:${a.provider}`) })
  h.deleteModelCredential.mockImplementation(async (a: { ownerType: string; kind: string; provider: string }) => { h.held.delete(`${a.ownerType}:${a.kind === 'SUBSCRIPTION' ? 'subscription' : a.provider}`) })
})

describe('the Add model access menu', () => {
  it('offers each item with its line, and groups the OpenCode providers', () => {
    render(<ModelAccessSection ownerType="user" ownerId="u1" />)
    openMenu()
    for (const [label, line] of Object.entries(LINES)) {
      const text = items().find(t => t.startsWith(label))
      expect(text, label).toBeTruthy()
      expect(text).toContain(line)
    }
    expect(screen.getByText('Other providers')).toBeTruthy()
    expect(items()[0]).toContain('recommended')
  })

  it('leaves out what is already set', () => {
    h.held = new Set(['user:subscription', 'user:openai'])
    render(<ModelAccessSection ownerType="user" ownerId="u1" />)
    openMenu()
    expect(items().some(t => t.startsWith('Claude subscription'))).toBe(false)
    expect(items().some(t => t.startsWith('OpenAI'))).toBe(false)
    expect(items().some(t => t.startsWith('OpenRouter'))).toBe(true)
  })

  it("does not offer the Claude subscription for the organisation's keys", () => {
    render(<ModelAccessSection ownerType="org" ownerId="org" />)
    openMenu()
    expect(items().some(t => t.startsWith('Claude subscription'))).toBe(false)
    expect(items()).toHaveLength(5)
  })

  it('goes away when everything is set', () => {
    h.held = new Set(['org:anthropic', 'org:openrouter', 'org:openai', 'org:google', 'org:openai_compatible'])
    render(<ModelAccessSection ownerType="org" ownerId="org" />)
    expect(screen.queryByRole('button', { name: /Add model access/ })).toBeNull()
  })
})

describe('adding a key', () => {
  it('opens that provider\'s dialog, saves it at the boundary, and lists it', async () => {
    render(<ModelAccessSection ownerType="org" ownerId="org" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /GPT models/ }))
    const dialog = screen.getByRole('dialog', { name: 'Add OpenAI key' })
    fireEvent.change(within(dialog).getByLabelText('OpenAI API key'), { target: { value: 'sk-1' } })
    fireEvent.submit(within(dialog).getByLabelText('OpenAI API key').closest('form')!)
    await waitFor(() => expect(h.setModelCredential).toHaveBeenCalledWith({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider: 'openai', secret: 'sk-1' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('OpenAI key')).toBeTruthy()
    expect(screen.getByText(/the organisation's/)).toBeTruthy()
    expect(screen.getByText('GPT models')).toBeTruthy()
  })

  it('closes on Cancel without saving', () => {
    render(<ModelAccessSection ownerType="org" ownerId="org" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Many models/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.setModelCredential).not.toHaveBeenCalled()
  })

  it('saves an endpoint with its base URL and no key', async () => {
    render(<ModelAccessSection ownerType="project" ownerId="p1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Any OpenAI-compatible server/ }))
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'http://localhost:11434/v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }))
    await waitFor(() => expect(h.setModelCredential).toHaveBeenCalledWith({ ownerType: 'project', ownerId: 'p1', kind: 'API_KEY', provider: 'openai_compatible', baseUrl: 'http://localhost:11434/v1', secret: '' }))
  })

  it('shows a refusal from the server and stays open', async () => {
    h.setModelCredential.mockRejectedValue(new Error('Not allowed'))
    render(<ModelAccessSection ownerType="org" ownerId="org" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Anthropic API key/ }))
    fireEvent.change(screen.getByLabelText('Anthropic API key'), { target: { value: 'sk-ant-abc' } })
    fireEvent.submit(screen.getByLabelText('Anthropic API key').closest('form')!)
    expect(await screen.findByText('Not allowed')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('adding a Claude subscription', () => {
  it('opens the sign-in flow behind the confirmation, at the person', async () => {
    h.startClaudeLogin.mockResolvedValue({ loginId: 'l1', url: 'https://claude.com/x' })
    render(<ModelAccessSection ownerType="user" ownerId="u1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Claude subscription/ }))
    expect(screen.getByText(/This subscription is mine/)).toBeTruthy()
    const signIn = screen.getByRole('button', { name: 'Sign in with Claude' }) as HTMLButtonElement
    expect(signIn.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(signIn)
    await waitFor(() => expect(h.startClaudeLogin).toHaveBeenCalledWith({ ownerType: 'user', ownerId: 'u1', termsAccepted: true }))
  })
})

describe('what is set', () => {
  it('lists each with whose it is and its line', () => {
    h.held = new Set(['user:subscription', 'user:openai'])
    render(<ModelAccessSection ownerType="user" ownerId="u1" />)
    expect(screen.getByText('Claude subscription')).toBeTruthy()
    expect(screen.getByText(LINES['Claude subscription'])).toBeTruthy()
    expect(screen.getByText('GPT models')).toBeTruthy()
  })

  it('says a stored subscription is not in use when the server says so', () => {
    h.held = new Set(['project:subscription'])
    h.unusable = true
    render(<ModelAccessSection ownerType="project" ownerId="p1" />)
    expect(screen.getByText(/Stored but not in use/)).toBeTruthy()
  })

  it('removes after a confirmation in place, and the item returns to the menu', async () => {
    h.held = new Set(['org:openai'])
    render(<ModelAccessSection ownerType="org" ownerId="org" />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove OpenAI key' }))
    const group = screen.getByRole('group', { name: 'Remove OpenAI key' })
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }))
    expect(h.deleteModelCredential).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove OpenAI key' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove OpenAI key' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(h.deleteModelCredential).toHaveBeenCalledWith({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider: 'openai' }))
    await waitFor(() => expect(screen.queryByText('GPT models')).toBeNull())
    openMenu()
    expect(items().some(t => t.startsWith('OpenAI'))).toBe(true)
  })
})
