// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ModelList } from '../ModelList'
import type { ListModel } from '../modelListLogic'

vi.mock('@agenthix/ui/primitives', async (importOriginal) => {
  const R = await import('react')
  return {
    ...(await importOriginal<typeof import('@agenthix/ui/primitives')>()),
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => { const { variant, size, ...rest } = p; void variant; void size; return R.createElement('button', rest) },
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
    PlainSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
  }
})
afterEach(cleanup)

const l = (key: string, label: string, maker: string, price: 1 | 2 | 3 = 2): ListModel =>
  ({ id: key, key, label, maker, providers: ['OpenRouter'], route: null, price })
const models = [
  l('deepseek/deepseek-v4-flash', 'DeepSeek V4.1 Flash', 'DeepSeek', 1),
  l('deepseek/deepseek-v4', 'DeepSeek V4.1', 'DeepSeek'),
  l('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic'),
]

const many = (over: Partial<React.ComponentProps<typeof ModelList>> = {}) => {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(<ModelList mode="many" models={models} offered="Models your providers reach" onClose={onClose} onAdd={onAdd}
    added={m => m.id === 'anthropic/claude-sonnet-5'} patternAdded={() => false} {...over as object} />)
  return { onAdd, onClose }
}
const row = (text: string) => within(screen.getByRole('listbox')).getAllByRole('option').find(o => o.textContent?.includes(text))!

describe('the model list, choosing many @SC-1202', () => {
  it('ticks a row on a click without closing, and adds what is ticked with Add N models', () => {
    const { onAdd, onClose } = many()
    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true')
    fireEvent.click(row('DeepSeek V4.1 Flash'))
    fireEvent.click(row('DeepSeek V4.1$$'))
    expect(row('DeepSeek V4.1 Flash').getAttribute('aria-selected')).toBe('true')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('2 chosen')).toBeTruthy()
    fireEvent.click(screen.getByText('Add 2 models'))
    expect(onAdd).toHaveBeenCalledWith({ models: ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4'], patterns: [] })
    expect(onClose).toHaveBeenCalled()
  })

  it('unticks a row on a second click, and keeps Add off while nothing is chosen', () => {
    many()
    expect((screen.getByText('Add models') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(row('DeepSeek V4.1 Flash'))
    fireEvent.click(row('DeepSeek V4.1 Flash'))
    expect(screen.getByText('0 chosen')).toBeTruthy()
  })

  it('reads Added on a row already in the list, which cannot be added again', () => {
    const { onAdd } = many()
    const sonnet = row('Claude Sonnet 5')
    expect(sonnet.textContent).toContain('Added')
    expect(sonnet.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(sonnet)
    expect(screen.getByText('0 chosen')).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('offers what is typed as a pattern when it covers several models, and adds it', () => {
    const { onAdd } = many()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'deepseek' } })
    const pattern = within(screen.getByRole('listbox')).getAllByRole('option')[0]
    expect(pattern.textContent).toBe('＋ Add the pattern deepseek/*covers 2 models')
    fireEvent.keyDown(screen.getByLabelText('Search models'), { key: 'Enter' })
    fireEvent.click(row('DeepSeek V4.1 Flash'))
    fireEvent.click(screen.getByText('Add 1 pattern and 1 model'))
    expect(onAdd).toHaveBeenCalledWith({ models: ['deepseek/deepseek-v4-flash'], patterns: ['deepseek/*'] })
  })

  it('offers no pattern for text that names one model', () => {
    many()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'sonnet' } })
    expect(screen.queryByText(/Add the pattern/)).toBeNull()
  })

  it('reads Added on a pattern the list already holds', () => {
    many({ patternAdded: (p: string) => p === 'deepseek/*' } as Partial<React.ComponentProps<typeof ModelList>>)
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'deepseek' } })
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0].textContent).toContain('Added')
  })

  it('never has a default row, and Cancel closes without adding', () => {
    const { onAdd, onClose } = many()
    expect(within(screen.getByRole('listbox')).getAllByRole('option').some(o => o.textContent?.startsWith('Default'))).toBe(false)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
