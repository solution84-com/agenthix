// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PlaceOverview } from '../components/PlaceOverview'
import { testPlace } from './placeFixture'

function renderOverview(place = testPlace(), onOpenTool = vi.fn()) {
  render(<PlaceOverview place={place} onOpenTool={onOpenTool} />)
  return onOpenTool
}

describe('PlaceOverview @SC-1023', () => {
  it('shows the facts, then the tools in their groups with their counts', () => {
    renderOverview()
    const facts = screen.getByRole('region', { name: 'About this project' })
    expect(within(facts).getByText('Lead').nextSibling?.textContent).toBe('Avery')
    const tools = screen.getByRole('region', { name: 'Tools' })
    expect(within(tools).getByText('Work')).toBeTruthy()
    expect(within(tools).getByRole('button', { name: /Tasks/ }).textContent).toContain('1 needs you · 12')
  })

  it('shows the description under the facts’ heading @SC-1046', () => {
    renderOverview(testPlace({ description: 'Rebuild the website: new pages and faster loading.' }))
    const facts = screen.getByRole('region', { name: 'About this project' })
    expect(within(facts).getByText('Rebuild the website: new pages and faster loading.')).toBeTruthy()
    expect(facts.querySelector('p')).not.toBeNull()
  })

  it('shows no description paragraph when the project has none @SC-1046', () => {
    renderOverview(testPlace({ description: null }))
    expect(screen.getByRole('region', { name: 'About this project' }).querySelector('p')).toBeNull()
  })

  it('puts Members after the facts with no heading, before the tools, and Settings alone at the foot', () => {
    renderOverview()
    const labels = within(screen.getByTestId('place-overview')).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Membersfaces6', 'Tasks1 needs you · 12', 'Boards3', 'Timeline', 'Runs2', 'Settings'])
  })

  it('has no Members row where the place gives none (the personal space)', () => {
    renderOverview(testPlace({ teamRows: undefined }))
    expect(screen.queryByRole('button', { name: /Members/ })).toBeNull()
  })

  it('shows › on a row with no count, and none on a row that has one', () => {
    renderOverview()
    expect(screen.getByRole('button', { name: /Timeline/ }).querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Boards/ }).querySelector('svg')).toBeNull()
  })

  it('opens a row’s section', () => {
    const open = renderOverview()
    fireEvent.click(screen.getByRole('button', { name: /Boards/ }))
    fireEvent.click(screen.getByRole('button', { name: /Members/ }))
    expect(open.mock.calls).toEqual([['boards'], ['members']])
  })
})
