// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ListEditor } from '../ListEditor'
import type { ListView, ReachableModel } from '../../types'

vi.mock('@agenthix/ui/primitives', async () => {
  const R = await import('react')
  return {
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => { const { variant, size, ...rest } = p; void variant; void size; return R.createElement('button', rest) },
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
  }
})
afterEach(cleanup)

const reachable: ReachableModel[] = [
  { key: 'xai/grok-4', label: 'Grok 4', maker: 'xAI', via: ['OpenRouter'], price: 2 },
  { key: 'anthropic/claude-opus-5', label: 'Claude Opus 5', maker: 'Anthropic', via: ['Anthropic'], price: 3 },
]
const view = (over: Partial<ListView> = {}): ListView => ({
  owner: 'organisation', ownerId: 'o1', mode: 'every', reachable: 2, allowedAbove: 2, allowed: 1,
  entries: [{ effect: 'never', pattern: 'xai/*', kind: 'maker', covers: 1, meaning: 'Every model made by xAI' }], ...over,
})

describe('the list editor @SC-1202', () => {
  it('shows an entry with what it means and how many models it covers', () => {
    render(<ListEditor view={view()} reachable={reachable} intro="For everyone." save={vi.fn()} />)
    expect(screen.getByText('xai/*')).toBeTruthy()
    expect(screen.getByLabelText('Remove xai/*').closest('li')?.getAttribute('title')).toBe('Every model made by xAI · 1 model')
    expect(screen.getByText('2 reachable, 1 allowed')).toBeTruthy()
  })

  it('adds models to Never through the model list, choosing many, saving the whole list', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ListEditor view={view()} reachable={reachable} intro="x" save={save} />)
    expect(screen.queryByLabelText('Add to Never')).toBeNull()
    expect(screen.queryByText('Select in bulk…')).toBeNull()
    fireEvent.click(screen.getByLabelText('Add models to Never'))
    const grok = within(screen.getByRole('listbox')).getAllByRole('option').find(o => o.textContent?.includes('Grok 4'))!
    expect(grok.textContent).toContain('Added')
    fireEvent.click(screen.getByText('Claude Opus 5'))
    fireEvent.click(screen.getByText('Add 1 model'))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'every', entries: [{ effect: 'never', pattern: 'xai/*' }, { effect: 'never', pattern: 'anthropic/claude-opus-5' }] }))
  })

  it('adds a typed pattern, and removes an entry with its ✕', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ListEditor view={view()} reachable={reachable} intro="x" save={save} />)
    fireEvent.click(screen.getByLabelText('Add models to Never'))
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'deepseek/*' } })
    fireEvent.keyDown(screen.getByLabelText('Search models'), { key: 'Enter' })
    fireEvent.click(screen.getByText('Add 1 pattern'))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'every', entries: [{ effect: 'never', pattern: 'xai/*' }, { effect: 'never', pattern: 'deepseek/*' }] }))
    fireEvent.click(screen.getByLabelText('Remove xai/*'))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ mode: 'every', entries: [] }))
  })

  it('shows a model entry as a chip with its name, and a pattern with how many models it covers', () => {
    render(<ListEditor view={view({ mode: 'only_these', entries: [
      { effect: 'allow', pattern: 'anthropic/claude-opus-5', kind: 'model', covers: 1, meaning: 'Claude Opus 5' },
      { effect: 'never', pattern: 'xai/*', kind: 'maker', covers: 1, meaning: 'Every model made by xAI' },
    ] })} reachable={reachable} intro="x" save={vi.fn()} />)
    expect(screen.getByLabelText('Remove anthropic/claude-opus-5').closest('li')?.textContent).toBe('Claude Opus 5')
    expect(screen.getByLabelText('Remove xai/*').closest('li')?.textContent).toBe('xai/*· 1 model')
  })

  it('switches to Only these, which shows an Only section and says new models stay off', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ListEditor view={view()} reachable={reachable} intro="x" save={save} />)
    fireEvent.click(screen.getByLabelText(/Only these/))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'only_these', entries: [{ effect: 'never', pattern: 'xai/*' }] }))
    rerender(<ListEditor view={view({ mode: 'only_these', entries: [] })} reachable={reachable} intro="x" save={save} />)
    expect(screen.getByLabelText('Add models to Only')).toBeTruthy()
    expect(screen.getByText(/no model may run/)).toBeTruthy()
  })

  it('says what it could not save', async () => {
    render(<ListEditor view={view()} reachable={reachable} intro="x" save={vi.fn().mockRejectedValue(new Error('Only an organisation admin changes this list.'))} />)
    fireEvent.click(screen.getByLabelText('Remove xai/*'))
    expect((await screen.findByRole('alert')).textContent).toContain('Only an organisation admin')
  })

  it('words a list under the organisation’s', () => {
    render(<ListEditor view={view({ owner: 'project', allowedAbove: 291, allowed: 268, reachable: 318 })} reachable={reachable} above="Fernhill" intro="x" save={vi.fn()} />)
    expect(screen.getByText('Any model Fernhill allows, except these')).toBeTruthy()
    expect(screen.getByText('291 allowed in Fernhill, 268 here')).toBeTruthy()
  })
})
