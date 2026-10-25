// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const h = vi.hoisted(() => ({ data: undefined as unknown, add: vi.fn(), remove: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.data }),
  useAction: (fn: (a: unknown) => unknown) => fn,
  getConversationPlaces: 'getConversationPlaces',
  addConversationPlace: (a: unknown) => h.add(a),
  removeConversationPlace: (a: unknown) => h.remove(a),
}))

import { ConversationPlaces } from '../ConversationPlaces'
import { SuggestPlaceCard, SuggestPlaceCardRow } from '../SuggestPlaceCard'

const own = { kind: 'user' as const, name: 'Your space', level: 'personal' }
const shop = { kind: 'project' as const, projectId: 'p1', name: 'Shop', level: 'member' }
const web = { kind: 'project' as const, projectId: 'p2', name: 'Website rebuild', level: 'admin' }
const view = (over: Record<string, unknown> = {}) => ({
  own,
  added: [{ ...web, addedBy: { id: 'u1', name: 'Mia' }, addedAt: '2026-10-25T10:00:00.000Z' }],
  addable: [shop],
  ...over,
})
const mount = (canChange = true) => render(<ConversationPlaces conversationId="c1" agentName="Kernel" canChange={canChange} />)
const desktop = () => within(screen.getAllByTestId('places-list')[0])

beforeEach(() => { h.data = view(); h.add.mockReset().mockResolvedValue(undefined); h.remove.mockReset().mockResolvedValue(undefined) })
afterEach(cleanup)

describe('the conversation header places @SC-1441', () => {
  it('shows nothing until the places load', () => {
    h.data = undefined
    mount()
    expect(screen.queryByTestId('conversation-places')).toBeNull()
  })

  it('lists the own place first, without a remove, then each added place with one', () => {
    mount()
    const list = desktop()
    expect(list.getByTestId('place-own').textContent).toBe('Your space')
    expect(within(list.getByTestId('place-own')).queryByRole('button')).toBeNull()
    expect(list.getByTestId('place-added').textContent).toContain('Website rebuild')
    expect(list.getByLabelText('Remove Website rebuild')).toBeTruthy()
  })

  it('removes an added place', async () => {
    mount()
    fireEvent.click(desktop().getByLabelText('Remove Website rebuild'))
    await waitFor(() => expect(h.remove).toHaveBeenCalledWith({ conversationId: 'c1', place: { kind: 'project', projectId: 'p2' } }))
  })

  it('lists the addable places, shows the notice once on choosing, and adds only after Add', async () => {
    mount()
    fireEvent.click(desktop().getByText('Add place…'))
    fireEvent.click(desktop().getByText('Shop'))
    expect(desktop().getByTestId('add-place-notice').textContent).toBe(
      "Kernel will be able to read Shop's knowledge and start work there. What it finds can reach the other places in this conversation.",
    )
    expect(h.add).not.toHaveBeenCalled()
    fireEvent.click(desktop().getByText('Add Shop'))
    await waitFor(() => expect(h.add).toHaveBeenCalledWith({ conversationId: 'c1', place: { kind: 'project', projectId: 'p1' } }))
    await waitFor(() => expect(desktop().queryByTestId('add-place-panel')).toBeNull())
  })

  it('Cancel on the notice adds nothing', () => {
    mount()
    fireEvent.click(desktop().getByText('Add place…'))
    fireEvent.click(desktop().getByText('Shop'))
    fireEvent.click(desktop().getByText('Cancel'))
    expect(h.add).not.toHaveBeenCalled()
    expect(desktop().queryByTestId('add-place-notice')).toBeNull()
  })

  it('says so when there is no other place to add', () => {
    h.data = view({ addable: [] })
    mount()
    fireEvent.click(desktop().getByText('Add place…'))
    expect(desktop().getByText('There is no other place you can access to add.')).toBeTruthy()
  })

  it('shows the list read-only to anyone but the conversation’s person', () => {
    mount(false)
    expect(desktop().getByTestId('place-own')).toBeTruthy()
    expect(desktop().queryByLabelText('Remove Website rebuild')).toBeNull()
    expect(desktop().queryByText('Add place…')).toBeNull()
  })

  it('shows a refusal in words', async () => {
    h.add.mockRejectedValue(new Error('Shop is not a place you can access. Nothing was changed.'))
    mount()
    fireEvent.click(desktop().getByText('Add place…'))
    fireEvent.click(desktop().getByText('Shop'))
    fireEvent.click(desktop().getByText('Add Shop'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.'))
  })

  it('on a phone says "2 places", and a tap opens the list as a sheet', () => {
    mount()
    expect(screen.getByText('2 places')).toBeTruthy()
    expect(screen.queryByTestId('places-sheet')).toBeNull()
    fireEvent.click(screen.getByText('2 places'))
    const sheet = within(screen.getByTestId('places-sheet'))
    expect(sheet.getByTestId('place-own').textContent).toBe('Your space')
    expect(sheet.getByLabelText('Remove Website rebuild')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('places-sheet')).toBeNull()
  })

  it('counts one place as "1 place"', () => {
    h.data = view({ added: [] })
    mount()
    expect(screen.getByText('1 place')).toBeTruthy()
  })
})

describe('the suggest-a-place card @SC-1440', () => {
  const card = { kind: 'suggest_place' as const, place: shop, why: 'To set the release process up there.' }

  it('reads Add a place to this conversation, with the reason, Not now and Add <place>', () => {
    render(<SuggestPlaceCardRow conversationId="c1" card={card} agentName="Kernel" canAnswer />)
    expect(screen.getByText('Add a place to this conversation: Shop')).toBeTruthy()
    expect(screen.getByTestId('suggest-place-why').textContent).toBe('To set the release process up there.')
    expect(screen.getByText('Not now')).toBeTruthy()
    expect(screen.getByText('Add Shop')).toBeTruthy()
  })

  it('Add Shop calls addConversationPlace', async () => {
    render(<SuggestPlaceCardRow conversationId="c1" card={card} agentName="Kernel" canAnswer />)
    fireEvent.click(screen.getByText('Add Shop'))
    await waitFor(() => expect(h.add).toHaveBeenCalledWith({ conversationId: 'c1', place: { kind: 'project', projectId: 'p1' } }))
  })

  it('shows as answered, without buttons, once the place is in the conversation', () => {
    h.data = view({ added: [{ ...shop, addedBy: { id: 'u1', name: 'Mia' }, addedAt: '2026-10-25T10:00:00.000Z' }], addable: [] })
    render(<SuggestPlaceCardRow conversationId="c1" card={card} agentName="Kernel" canAnswer />)
    expect(screen.getByTestId('suggest-place-added')).toBeTruthy()
    expect(screen.queryByText('Add Shop')).toBeNull()
    expect(screen.queryByText('Not now')).toBeNull()
  })

  it('Not now hides it and adds nothing', () => {
    render(<SuggestPlaceCardRow conversationId="c1" card={card} agentName="Kernel" canAnswer />)
    fireEvent.click(screen.getByText('Not now'))
    expect(screen.queryByTestId('suggest-place-card')).toBeNull()
    expect(h.add).not.toHaveBeenCalled()
  })

  it('shows no buttons to anyone but the conversation’s person', () => {
    render(<SuggestPlaceCard place={shop} why="x" agentName="Kernel" canAnswer={false} onAdd={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByText('Add Shop')).toBeNull()
    expect(screen.queryByText('Not now')).toBeNull()
  })

  it('keeps the card and says why when the add is refused', async () => {
    h.add.mockRejectedValue(new Error('Shop is not a place you can access. Nothing was changed.'))
    render(<SuggestPlaceCardRow conversationId="c1" card={card} agentName="Kernel" canAnswer />)
    fireEvent.click(screen.getByText('Add Shop'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.'))
    expect(screen.getByTestId('suggest-place-card')).toBeTruthy()
  })
})
