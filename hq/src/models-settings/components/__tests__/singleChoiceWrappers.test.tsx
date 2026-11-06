// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ModelChoices } from '@agenthix/core'
import type { ChoiceView } from '../../types'

const h = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.data }),
  getModelPickerChoices: 'getModelPickerChoices',
}))
vi.mock('@agenthix/ui/primitives', async () => {
  const R = await import('react')
  return {
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => R.createElement('button', p),
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
  }
})

import { TaskModelField } from '../TaskModelField'
import { ModelChoiceRow } from '../ModelChoiceRow'

const c = (value: string, label: string) => ({ value, label, maker: 'Anthropic', via: 'via Anthropic', price: 2 as const })
const choices: ModelChoices = { current: null, recent: [], models: [c('p1/claude-sonnet-5', 'Claude Sonnet 5'), c('p1/claude-opus-5', 'Claude Opus 5')] }
const view = (model: string, text: string): ChoiceView => ({ providerId: 'p1', model, text, notWorking: false })
const rows = () => within(screen.getByRole('listbox')).getAllByRole('option')
afterEach(cleanup)

describe('a task’s and a routine’s model field, choosing one @SC-953', () => {
  it('follows the default when empty, with the default first in the list, and chooses one model', () => {
    h.data = choices
    const onChange = vi.fn()
    render(<TaskModelField projectId="p" value="" onChange={onChange} />)
    expect(screen.getByLabelText('Model').textContent).toBe('Default')
    fireEvent.click(screen.getByLabelText('Model'))
    expect(rows()[0].textContent).toBe('Defaultset by the agent or the organisation')
    expect(rows()[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByText('Claude Opus 5'))
    expect(onChange).toHaveBeenCalledWith('p1/claude-opus-5')
  })

  it('goes back to the default from its row', () => {
    h.data = choices
    const onChange = vi.fn()
    render(<TaskModelField projectId="p" value="p1/claude-opus-5" onChange={onChange} />)
    expect(screen.getByLabelText('Model').textContent).toBe('Claude Opus 5')
    fireEvent.click(screen.getByLabelText('Model'))
    fireEvent.click(rows()[0])
    expect(onChange).toHaveBeenCalledWith('')
  })
})

describe('a model setting’s row, choosing one @SC-953', () => {
  it('on the organisation’s page has no default row: nothing sits above its own default', () => {
    const onChange = vi.fn()
    render(<ModelChoiceRow label="Conversation" choices={choices} own={view('claude-sonnet-5', 'Claude Sonnet 5 · via Anthropic')}
      shown={view('claude-sonnet-5', 'Claude Sonnet 5 · via Anthropic')} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Change conversation'))
    expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining('Claude Sonnet 5'), expect.stringContaining('Claude Opus 5')])
    expect(rows()[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(rows()[1])
    expect(onChange).toHaveBeenCalledWith('p1/claude-opus-5')
  })

  it('on an agent’s page puts the organisation’s first as the default, and choosing it follows the organisation', () => {
    const onChange = vi.fn()
    const onFollow = vi.fn()
    const org = view('claude-sonnet-5', 'Claude Sonnet 5 · via Anthropic')
    render(<ModelChoiceRow label="Conversation" choices={choices} own={view('claude-opus-5', 'Claude Opus 5 · via Anthropic')} shown={org}
      whom={{ org: 'Fernhill', agent: 'Writer', orgChoice: org, onFollow }} onChange={onChange} />)
    expect(screen.getByLabelText('Change conversation').textContent).toBe('Change')
    fireEvent.click(screen.getByLabelText('Change conversation'))
    expect(rows()[0].textContent).toBe('Default · Claude Sonnet 5set by Fernhill')
    expect(rows().filter(r => r.getAttribute('aria-selected') === 'true').map(r => r.textContent)).toEqual([expect.stringContaining('Claude Opus 5')])
    fireEvent.click(rows()[0])
    expect(onFollow).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('on an agent’s page following the organisation ticks the default row', () => {
    const org = view('claude-sonnet-5', 'Claude Sonnet 5 · via Anthropic')
    render(<ModelChoiceRow label="Conversation" choices={choices} own={null} shown={org}
      whom={{ org: 'Fernhill', agent: 'Writer', orgChoice: org, onFollow: vi.fn() }} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Change conversation').textContent).toBe('Give Writer its own')
    fireEvent.click(screen.getByLabelText('Change conversation'))
    expect(rows().filter(r => r.getAttribute('aria-selected') === 'true')).toEqual([rows()[0]])
  })
})
