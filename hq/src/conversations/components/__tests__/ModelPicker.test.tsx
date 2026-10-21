// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModelPicker } from '../ModelPicker'
import type { ModelChoice, ModelChoices } from '../../../shared/conversations/protocol'

const c = (value: string, label: string, maker: string, via = 'via OpenRouter', price: 1 | 2 | 3 = 2): ModelChoice =>
  ({ value, label, maker, via, price })
const choices: ModelChoices = {
  current: 'deepseek/v4-flash',
  recent: [c('deepseek/v4-flash', 'DeepSeek V4 Flash', 'DeepSeek', "the organisation's key", 1)],
  models: [
    c('claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic'),
    c('claude-opus-5', 'Claude Opus 5', 'Anthropic', 'via OpenRouter', 3),
    c('claude-haiku-4-5', 'Claude Haiku 4.5', 'Anthropic', 'via OpenRouter', 1),
    c('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'Anthropic'),
    c('deepseek/v4-flash', 'DeepSeek V4 Flash', 'DeepSeek', "the organisation's key", 1),
  ],
}
afterEach(cleanup)

const open = (props: Partial<React.ComponentProps<typeof ModelPicker>> = {}) => {
  const onChange = vi.fn()
  render(<ModelPicker choices={choices} value="deepseek/v4-flash" onChange={onChange} ariaLabel="Model" {...props} />)
  fireEvent.click(screen.getByLabelText('Model'))
  return onChange
}

describe('the model picker @SC-953', () => {
  it('shows the current model on the chip, and the choices are not loaded behind it', () => {
    render(<ModelPicker choices={choices} value="deepseek/v4-flash" onChange={vi.fn()} ariaLabel="Model" />)
    expect(screen.getByLabelText('Model').textContent).toBe('DeepSeek V4 Flash')
    expect(screen.queryByTestId('model-picker')).toBeNull()
  })

  it('opens with the search field focused, Recent, then groups with the access beside each', () => {
    open()
    expect(document.activeElement).toBe(screen.getByLabelText('Search models'))
    const text = screen.getByTestId('model-picker').textContent ?? ''
    expect(text.indexOf('Recent')).toBeLessThan(text.indexOf('Anthropic'))
    expect(text).toContain('via OpenRouter')
    expect(text).toContain("the organisation's key")
    expect(screen.getByText('Show 1 more Anthropic')).toBeTruthy()
  })

  it('marks the current model with a check and shows the price hint', () => {
    open()
    const current = screen.getAllByRole('option').filter(o => o.getAttribute('aria-selected') === 'true')
    expect(current.length).toBeGreaterThan(0)
    expect(current[0].textContent).toContain('DeepSeek V4 Flash')
    expect(screen.getByText('$$$')).toBeTruthy()
  })

  it('shows the rest of a maker on Show more', () => {
    open()
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull()
    fireEvent.click(screen.getByText('Show 1 more Anthropic'))
    expect(screen.getByText('Claude Sonnet 4.6')).toBeTruthy()
  })

  it('searches any part of a name and keeps the matches grouped', () => {
    open()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'sonn' } })
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      expect.stringContaining('Claude Sonnet 5'), expect.stringContaining('Claude Sonnet 4.6'),
    ])
    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('shows the access on each row of a model listed twice', () => {
    const twice: ModelChoices = { current: null, recent: [], models: [
      c('claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via Anthropic'),
      c('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via OpenRouter'),
      c('claude-opus-5', 'Claude Opus 5', 'Anthropic', 'via Anthropic'),
    ] }
    open({ choices: twice, value: '' })
    const rows = screen.getAllByRole('option').map(o => o.textContent ?? '')
    expect(rows[0]).toContain('via Anthropic')
    expect(rows[1]).toContain('via OpenRouter')
    expect(rows[2]).not.toContain('via')
  })

  it('says when nothing matches', () => {
    open()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No model matches/)).toBeTruthy()
  })

  it('chooses with the arrow keys and Enter, and closes', () => {
    const onChange = open()
    const search = screen.getByLabelText('Search models')
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('claude-opus-5')
    expect(screen.queryByTestId('model-picker')).toBeNull()
  })

  it('chooses with a click', () => {
    const onChange = open()
    fireEvent.click(screen.getByText('Claude Opus 5'))
    expect(onChange).toHaveBeenCalledWith('claude-opus-5')
  })

  it('closes on Escape without choosing', () => {
    const onChange = open()
    fireEvent.keyDown(screen.getByLabelText('Search models'), { key: 'Escape' })
    expect(screen.queryByTestId('model-picker')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the form’s empty choice on top and chooses it as an empty value', () => {
    const onChange = open({ value: '', emptyLabel: 'No ceiling' })
    expect(screen.getByLabelText('Model').textContent).toBe('No ceiling')
    expect(screen.getAllByRole('option')[0].textContent).toContain('No ceiling')
    fireEvent.keyDown(screen.getByLabelText('Search models'), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('names a value the choices do not hold with the label function', () => {
    render(<ModelPicker choices={choices} value="gone" labelOf={() => 'Gone model'} onChange={vi.fn()} ariaLabel="Model" />)
    expect(screen.getByLabelText('Model').textContent).toBe('Gone model')
  })

  it('is disabled while the choices load', () => {
    render(<ModelPicker choices={undefined} value="" onChange={vi.fn()} ariaLabel="Model" />)
    expect((screen.getByLabelText('Model') as HTMLButtonElement).disabled).toBe(true)
  })
})


describe('the quiet model button @SC-953', () => {
  it('reads the maker’s mark and the short model name on a plain control, and the menu keeps the full name', () => {
    open({ quiet: true })
    const button = screen.getByLabelText('Model')
    expect(button.textContent).toBe('DSV4 Flash')
    expect(button.className).not.toMatch(/border/)
    expect(screen.getAllByText('DeepSeek V4 Flash').length).toBeGreaterThan(0)
  })

  it('has no Agent part: the agent has a button of its own', () => {
    open({ quiet: true })
    expect(screen.queryByRole('group', { name: 'Agent' })).toBeNull()
  })
})
