import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import { BackupsPage } from '../pages/backups/BackupsPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import type { FleetResponse } from '../pages/dashboard/types'
import { fakeServer } from './fakeServer'
import { fleet, host } from './shellFixtures'

// A card that shows a thing is one link as a whole (board *Proposal*, 3): the whole card opens the thing's page, and
// nothing inside it is a second link or a button.

const hqBox = host('machine-d', { hqMachine: true })
const office = host('office-server', { siteName: 'office' })
const FLEET: FleetResponse = {
  ...fleet([hqBox, office]),
  hq: { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' },
  disconnected: [{ id: 'd-1', fingerprint: 'f'.repeat(64), machineName: 'old-box', siteName: 'old', by: { userId: 'u1', name: 'Sam Rivera' }, at: new Date().toISOString() }],
}

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

/** The card's one link, which holds everything the card shows. */
function wholeLink(card: HTMLElement): HTMLElement {
  const [link, ...others] = within(card).getAllByRole('link')
  expect(others).toHaveLength(0)
  expect(card.firstElementChild).toBe(link)
  expect(within(link).queryAllByRole('button')).toHaveLength(0)
  return link
}

describe('a card is one link', () => {
  it('a site’s tile: anywhere on it opens the site, named after its machine @SC-896', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: FLEET } })
    render(<DashboardPage />)
    const link = wholeLink(await screen.findByRole('article', { name: 'office-server' }))
    expect(link.getAttribute('href')).toBe(`/sites/${office.fingerprint}`)
    expect(link.tagName).toBe('A')
    fireEvent.click(within(link).getByText('Healthy'))
    expect(window.location.pathname).toBe(`/sites/${office.fingerprint}`)
  })

  it('HQ’s card opens HQ’s page; Open HQ, which leaves for HQ itself, sits outside it @SC-896', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: FLEET } })
    render(<DashboardPage />)
    const hero = await screen.findByRole('region', { name: 'HQ' })
    const [card, open] = within(hero).getAllByRole('link')
    expect(card.getAttribute('href')).toBe('/hq')
    expect(within(card).getByRole('heading', { name: "Acme Robotics' HQ" })).toBeTruthy()
    expect(card.contains(open)).toBe(false)
    expect(open.getAttribute('href')).toBe('https://hq.acme.example')
  })

  it('a disconnected machine’s card is not a link: it has no page, and its actions are its buttons @SC-898', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: FLEET } })
    render(<DashboardPage />)
    const card = await screen.findByRole('article', { name: 'old-box' })
    expect(within(card).queryAllByRole('link')).toHaveLength(0)
    expect(within(card).getByRole('button', { name: 'Remove from the list' })).toBeTruthy()
  })

  it('a site’s row in Backups opens its backups; Back up now and Export… sit beside the link, not in it @SC-905', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: FLEET } })
    render(<BackupsPage />)
    const row = await screen.findByRole('article', { name: office.machineName })
    const [link, ...others] = within(row).getAllByRole('link')
    expect(others).toHaveLength(0)
    expect(link.getAttribute('href')).toBe(`/backups/${office.fingerprint}`)
    const backUp = within(row).getByRole('button', { name: 'Back up now' })
    expect(link.contains(backUp)).toBe(false)
    expect(link.contains(within(row).getByRole('button', { name: 'Export…' }))).toBe(false)
    expect(within(row).queryByRole('button', { name: 'Open' })).toBeNull()
  })
})
