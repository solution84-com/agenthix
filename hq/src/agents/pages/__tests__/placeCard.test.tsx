// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { PlaceCard } from '@agenthix/ui/projects'

afterEach(cleanup)

const base = { avatar: <span>FD</span>, name: 'Frontend dev', line: 'Builds the site · @frontend-dev', facts: ['3 projects', 'Sonnet 5.5'], action: 'Talk to it →' }

describe('the card of the Agents and Projects screens @SC-583', () => {
  it.each([
    ['needsYou', 'Needs you', 'text-warning', 'WEB-27 wants to run a command'],
    ['running', 'Running', 'text-success', 'Plan the pricing page · 4 min'],
    ['idle', 'Idle', 'text-text-muted', 'in no project yet'],
    ['quiet', 'Quiet', 'text-text-muted', 'last run 20 h ago'],
  ] as const)('leads the now line with %s, in its colour, then the detail', (state, label, tone, detail) => {
    render(<PlaceCard {...base} now={{ state, detail }} />)
    const now = within(screen.getByTestId('place-card')).getByTestId('place-card-now')
    expect(now.getAttribute('data-state')).toBe(state)
    const lead = within(now).getByText(label)
    expect(lead.className).toContain(tone)
    expect(now.textContent).toBe(`${label} · ${detail}`)
  })

  it('shows the state alone when there is no detail', () => {
    render(<PlaceCard {...base} now={{ state: 'idle' }} />)
    expect(within(screen.getByTestId('place-card')).getByTestId('place-card-now').textContent).toBe('Idle')
  })

  it('has its numbers and its one action, and no badge', () => {
    render(<PlaceCard {...base} now={{ state: 'idle' }} />)
    const card = within(screen.getByTestId('place-card'))
    expect(card.getByText('3 projects')).toBeTruthy()
    expect(card.getByText('Talk to it →')).toBeTruthy()
    expect(card.queryByText('1 needs you')).toBeNull()
  })

  it('runs its own action without opening the card when given one', () => {
    const open = vi.fn()
    const act = vi.fn()
    render(<a href="#x" onClick={open}><PlaceCard {...base} action="New conversation →" onAction={act} now={{ state: 'idle' }} /></a>)
    fireEvent.click(within(screen.getByTestId('place-card')).getByRole('button', { name: 'New conversation →' }))
    expect(act).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('puts the cover above the avatar when it has one', () => {
    render(<PlaceCard {...base} cover={<i data-testid="cover" />} now={{ state: 'idle' }} />)
    expect(within(screen.getByTestId('place-card')).getByTestId('cover')).toBeTruthy()
  })
})

describe('the compact row on a phone @SC-583', () => {
  it('is avatar, then three single lines: who, what it is doing, the facts', () => {
    render(<PlaceCard {...base} now={{ state: 'needsYou', detail: 'WEB-27 wants to run a command' }} />)
    const row = screen.getByTestId('place-card-row')
    expect(row.className).toContain('md:hidden')
    expect(within(row).getByText('Frontend dev').className).toContain('truncate')
    const now = within(row).getByTestId('place-card-now')
    expect(now.parentElement?.className).toContain('truncate')
    const facts = within(row).getByText('Builds the site · @frontend-dev · 3 projects · Sonnet 5.5')
    expect(facts.className).toContain('truncate')
  })

  it('is hidden on wide screens, where the card shows instead', () => {
    render(<PlaceCard {...base} now={{ state: 'idle' }} />)
    expect(screen.getByTestId('place-card').className).toContain('hidden md:flex')
  })
})
