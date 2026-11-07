// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const h = vi.hoisted(() => ({ change: vi.fn(), query: vi.fn() }))
vi.mock('@agenthix/ui/primitives', async () => {
  const R = await import('react')
  return {
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => R.createElement('button', p),
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
  }
})
vi.mock('wasp/client/operations', () => ({
  useAction: () => h.change,
  useQuery: (...a: unknown[]) => h.query(...a),
  getModelChoices: 'getModelChoices',
  setConversationModel: 'setConversationModel',
}))

import { ConversationModelPicker } from '../ConversationModelPicker'
import { StartModelPicker } from '../StartModelPicker'

const c = (value: string, label: string) => ({ value, label, maker: 'Anthropic', via: 'via OpenRouter', price: 2 as const })
const data = { current: 'claude-sonnet-5', recent: [], models: [c('claude-sonnet-5', 'Claude Sonnet 5'), c('claude-opus-5', 'Claude Opus 5')] }

beforeEach(() => {
  h.change.mockReset()
  h.change.mockResolvedValue(undefined)
  h.query.mockReset()
  h.query.mockReturnValue({ data })
})
afterEach(cleanup)

describe('the model in a conversation @SC-953', () => {
  it('asks for the conversation’s choices and changes the model with setConversationModel', async () => {
    render(<ConversationModelPicker conversationId="c1" model="claude-sonnet-5" />)
    expect(h.query).toHaveBeenCalledWith('getModelChoices', { conversationId: 'c1' })
    fireEvent.click(screen.getByLabelText('Model'))
    fireEvent.click(screen.getByText('Claude Opus 5'))
    await waitFor(() => expect(h.change).toHaveBeenCalledWith({ conversationId: 'c1', model: 'claude-opus-5' }))
  })

  it('puts the agent’s name before the button as plain text, not a button', () => {
    render(<ConversationModelPicker conversationId="c1" model="claude-sonnet-5" agentName="Kernel" />)
    expect(screen.getByText('Kernel')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Kernel/ })).toBeNull()
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Model'])
  })

  it('does nothing when the current model is chosen again', () => {
    render(<ConversationModelPicker conversationId="c1" model="claude-sonnet-5" />)
    fireEvent.click(screen.getByLabelText('Model'))
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0])
    expect(h.change).not.toHaveBeenCalled()
  })

  it('puts the model it talks on unless one is picked first, as Default, naming who may have set it', async () => {
    h.query.mockReturnValue({ data: { ...data, current: 'claude-opus-5', recommended: [c('claude-sonnet-5', 'Claude Sonnet 5')] } })
    render(<ConversationModelPicker conversationId="c1" model="claude-opus-5" agentName="Writer" />)
    fireEvent.click(screen.getByLabelText('Model'))
    const first = within(screen.getByRole('listbox')).getAllByRole('option')[0]
    expect(first.textContent).toBe('Default · Claude Sonnet 5set by Writer or the organisation')
    fireEvent.click(first)
    await waitFor(() => expect(h.change).toHaveBeenCalledWith({ conversationId: 'c1', model: 'claude-sonnet-5' }))
  })

  it('says why when the server refuses the change', async () => {
    h.change.mockRejectedValue(new Error('That model is above the ceiling'))
    render(<ConversationModelPicker conversationId="c1" model="claude-sonnet-5" />)
    fireEvent.click(screen.getByLabelText('Model'))
    fireEvent.click(screen.getByText('Claude Opus 5'))
    expect((await screen.findByRole('alert')).textContent).toBe('That model is above the ceiling')
  })
})

describe('the model before the first message @SC-953', () => {
  it('asks by home, shows the policy’s model, and reports a pick', () => {
    const onPick = vi.fn()
    render(<StartModelPicker home="PROJECT" projectId="p1" picked={null} onPick={onPick} />)
    expect(h.query).toHaveBeenCalledWith('getModelChoices', { home: 'PROJECT', projectId: 'p1' })
    expect(screen.getByLabelText('Model').textContent).toBe('ANSonnet 5')
    fireEvent.click(screen.getByLabelText('Model'))
    fireEvent.click(screen.getByText('Claude Opus 5'))
    expect(onPick).toHaveBeenCalledWith('claude-opus-5')
  })
})
