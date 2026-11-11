// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ModelPicker } from '../ModelPicker'
import type { ModelChoice, ModelChoices } from '../../../conversations/protocol'

vi.mock('@agenthix/ui/primitives', async (importOriginal) => {
  const R = await import('react')
  return {
    ...(await importOriginal<typeof import('@agenthix/ui/primitives')>()),
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => { const { variant, size, ...rest } = p; void variant; void size; return R.createElement('button', rest) },
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
    PlainSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement> & { size?: string }) => { const { size, ...rest } = p; void size; return R.createElement('select', rest) },
  }
})

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
const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent ?? '')

describe('the model picker, choosing one @SC-953', () => {
  it('shows the current model on the chip, and the choices are not loaded behind it', () => {
    render(<ModelPicker choices={choices} value="deepseek/v4-flash" onChange={vi.fn()} ariaLabel="Model" />)
    expect(screen.getByLabelText('Model').textContent).toBe('DeepSeek V4 Flash')
    expect(screen.queryByTestId('model-picker')).toBeNull()
  })

  it('opens with the search field focused, the filters, the makers as groups, and the line saying what is offered', () => {
    open()
    expect(document.activeElement).toBe(screen.getByLabelText('Search models'))
    const picker = screen.getByTestId('model-picker')
    for (const name of ['Maker', 'Provider', 'Price']) expect(within(picker).getByLabelText(name)).toBeTruthy()
    expect(picker.textContent).not.toContain('Recent')
    expect(picker.textContent).toContain('Only models every list that applies allows')
    expect(screen.getByText('Show 1 more Anthropic')).toBeTruthy()
  })

  it('marks the current model with a tick, and the price with marks explained in a tooltip', () => {
    open()
    const current = within(screen.getByRole('listbox')).getAllByRole('option').filter(o => o.getAttribute('aria-selected') === 'true')
    expect(current.map(o => o.textContent)).toEqual([expect.stringContaining('DeepSeek V4 Flash')])
    const marks = screen.getByLabelText('High cost')
    expect(marks.textContent).toBe('$$$')
    expect(marks.getAttribute('title')).toBe('Price per token, from $ low to $$$ high')
  })

  it('shows no route on a model reached one way, and the route on each row of a model reached two', () => {
    const twice: ModelChoices = { current: null, recent: [], models: [
      c('claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via Anthropic'),
      c('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via OpenRouter'),
      c('claude-opus-5', 'Claude Opus 5', 'Anthropic', 'via Anthropic'),
    ] }
    open({ choices: twice, value: '' })
    const rows = options()
    expect(rows[0]).toContain('via Anthropic')
    expect(rows[1]).toContain('via OpenRouter')
    expect(rows[2]).not.toContain('via')
  })

  it('puts the default first, reading Default · the model with who set it, ticked when it applies', () => {
    const onChange = open({ value: 'claude-sonnet-5', defaultRow: { model: 'Claude Sonnet 5', setBy: 'Writer', value: 'claude-sonnet-5' } })
    expect(screen.getByLabelText('Model').textContent).toBe('Default · Claude Sonnet 5')
    const rows = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(rows[0].textContent).toBe('Default · Claude Sonnet 5set by Writer')
    expect(rows.filter(o => o.getAttribute('aria-selected') === 'true')).toEqual([rows[0]])
    fireEvent.keyDown(screen.getByLabelText('Search models'), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('claude-sonnet-5')
  })

  it('puts a first row in its own words where the place names one that is not a default', () => {
    const onChange = open({ value: 'fake', defaultRow: { label: 'Fake model (test waiting)', under: 'answers after a delay', setBy: '', value: 'fake' } })
    expect(screen.getByLabelText('Model').textContent).toBe('Fake model (test waiting)')
    const rows = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(rows[0].textContent).toBe('Fake model (test waiting)answers after a delay')
    fireEvent.click(rows[1]!)
    expect(onChange).toHaveBeenCalledWith(expect.not.stringMatching(/^fake$/))
  })

  it('has no default row where the place has none', () => {
    open()
    expect(options().some(t => t.startsWith('Default'))).toBe(false)
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
    expect(options()).toEqual([expect.stringContaining('Claude Sonnet 5'), expect.stringContaining('Claude Sonnet 4.6')])
  })

  it('narrows by maker and by price', () => {
    open()
    fireEvent.change(screen.getByLabelText('Maker'), { target: { value: 'DeepSeek' } })
    expect(options()).toEqual([expect.stringContaining('DeepSeek V4 Flash')])
    fireEvent.change(screen.getByLabelText('Maker'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '3' } })
    expect(options()).toEqual([expect.stringContaining('Claude Opus 5')])
  })

  it('greys out and refuses a provider that is not working', () => {
    const down: ModelChoices = { current: null, recent: [], models: [
      c('claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via Agenthix Cloud'),
      { ...c('p-ant/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic', 'via Anthropic'), notWorking: true },
    ] }
    const onChange = open({ choices: down, value: '' })
    const rows = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(rows[1].textContent).toContain('via Anthropic · not working')
    expect(rows[1].getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(rows[1])
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(rows[0])
    expect(onChange).toHaveBeenCalledWith('claude-sonnet-5')
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
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('claude-opus-5')
    expect(screen.queryByTestId('model-picker')).toBeNull()
  })

  it('chooses with a click, and has no ticks or Add: a click chooses and closes', () => {
    const onChange = open()
    expect(screen.queryByText(/^Add/)).toBeNull()
    fireEvent.click(screen.getByText('Claude Opus 5'))
    expect(onChange).toHaveBeenCalledWith('claude-opus-5')
    expect(screen.queryByTestId('model-picker')).toBeNull()
  })

  it('closes on Escape without choosing', () => {
    const onChange = open()
    fireEvent.keyDown(screen.getByLabelText('Search models'), { key: 'Escape' })
    expect(screen.queryByTestId('model-picker')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('names a value the choices do not hold with the label function, and keeps a button text the place sets', () => {
    render(<ModelPicker choices={choices} value="gone" labelOf={() => 'Gone model'} onChange={vi.fn()} ariaLabel="Model" />)
    expect(screen.getByLabelText('Model').textContent).toBe('Gone model')
    cleanup()
    render(<ModelPicker choices={choices} value="claude-opus-5" buttonText="Change" onChange={vi.fn()} ariaLabel="Model" />)
    expect(screen.getByLabelText('Model').textContent).toBe('Change')
  })

  it('is disabled while the choices load', () => {
    render(<ModelPicker choices={undefined} value="" onChange={vi.fn()} ariaLabel="Model" />)
    expect((screen.getByLabelText('Model') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the quiet model button @SC-953', () => {
  it('reads the maker’s mark and the short model name on a plain control, and the list keeps the full name', () => {
    open({ quiet: true })
    const button = screen.getByLabelText('Model')
    expect(button.textContent).toBe('DSV4 Flash')
    expect(button.className).not.toMatch(/border/)
    expect(screen.getAllByText('DeepSeek V4 Flash').length).toBeGreaterThan(0)
  })
})
