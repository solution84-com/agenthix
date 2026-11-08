import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FilterTabs } from '../FilterTabs'

describe('FilterTabs', () => {
  it('draws each tab with its count, the chosen one pressed, and says which was chosen', () => {
    const onChange = vi.fn()
    render(
      <FilterTabs
        label="Show runs" value="all" onChange={onChange}
        tabs={[{ value: 'all', label: 'All', count: 124 }, { value: 'needs', label: 'Needs you', count: 5, title: '3 tasks · 1 failed' }, { value: 'mine', label: 'Mine' }]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Show runs' })
    const all = within(group).getByRole('button', { name: 'All 124' })
    expect(all.getAttribute('aria-pressed')).toBe('true')
    const needs = within(group).getByRole('button', { name: 'Needs you 5' })
    expect(needs.getAttribute('aria-pressed')).toBe('false')
    expect(needs.getAttribute('title')).toBe('3 tasks · 1 failed')
    expect(within(group).getByRole('button', { name: 'Mine' })).toBeTruthy()
    fireEvent.click(needs)
    expect(onChange).toHaveBeenCalledWith('needs')
  })
})
