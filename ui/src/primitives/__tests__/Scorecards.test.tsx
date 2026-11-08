import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Scorecards } from '../Scorecards'

describe('Scorecards', () => {
  it('draws a card that filters as a button, showing when it is chosen, and one that only counts as no button', () => {
    const onChoose = vi.fn()
    render(
      <Scorecards
        label="Runs today"
        items={[
          { key: 'needs', label: 'Needs you', count: '5', detail: 'show only them', onChoose, chosen: true },
          { key: 'spent', label: 'Spent today', count: '$0.44', detail: 'tokens, estimated' },
        ]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Runs today' })
    const needs = within(group).getByRole('button', { name: /Needs you/ })
    expect(needs.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(needs)
    expect(onChoose).toHaveBeenCalledOnce()
    expect(within(group).getAllByRole('button')).toHaveLength(1)
    expect(within(group).getByText('$0.44')).toBeTruthy()
  })
})
