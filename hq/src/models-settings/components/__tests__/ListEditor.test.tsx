// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ListEditor } from '../ListEditor'
import type { ListView, ReachableModel } from '../../types'

vi.mock('@agenthix/ui/primitives', async () => {
  const R = await import('react')
  return {
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => { const { variant, size, ...rest } = p; void variant; void size; return R.createElement('button', rest) },
    Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => R.createElement('input', p),
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => R.createElement('select', p),
    Modal: ({ children, title }: { children: React.ReactNode; title: string }) => R.createElement('div', { role: 'dialog', 'aria-label': title }, children),
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

describe('the list editor', () => {
  it('shows an entry with what it means and how many models it covers', () => {
    render(<ListEditor view={view()} reachable={reachable} intro="For everyone." save={vi.fn()} />)
    expect(screen.getByText('xai/*')).toBeTruthy()
    expect(screen.getByText(/Every model made by xAI · 1 model/)).toBeTruthy()
    expect(screen.getByText('2 reachable, 1 allowed')).toBeTruthy()
  })

  it('adds a pattern as a ban and removes one, saving the whole list each time', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ListEditor view={view()} reachable={reachable} intro="x" save={save} />)
    fireEvent.change(screen.getByLabelText('Add to Never'), { target: { value: 'deepseek/*' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'every', entries: [{ effect: 'never', pattern: 'xai/*' }, { effect: 'never', pattern: 'deepseek/*' }] }))
    fireEvent.click(screen.getByLabelText('Remove xai/*'))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ mode: 'every', entries: [] }))
  })

  it('switches to Only these, which shows an Only section and says new models stay off', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ListEditor view={view()} reachable={reachable} intro="x" save={save} />)
    fireEvent.click(screen.getByLabelText(/Only these/))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'only_these', entries: [{ effect: 'never', pattern: 'xai/*' }] }))
    rerender(<ListEditor view={view({ mode: 'only_these', entries: [] })} reachable={reachable} intro="x" save={save} />)
    expect(screen.getByLabelText('Add to Only')).toBeTruthy()
    expect(screen.getByText(/no model may run/)).toBeTruthy()
  })

  it('selects in bulk and adds the models found by name', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<ListEditor view={view({ entries: [] })} reachable={reachable} intro="x" save={save} />)
    fireEvent.click(screen.getByText('Select in bulk…'))
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'grok' } })
    fireEvent.click(screen.getByText('Never use these 1'))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'every', entries: [{ effect: 'never', pattern: 'xai/grok-4' }] }))
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
