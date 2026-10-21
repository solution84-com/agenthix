// @vitest-environment jsdom
/** The agent's card (every screen reviewed spec §3): its content, its actions, and the part for where you are. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

let cardHere: unknown = undefined
let mobile = false
const profile = {
  agent: { id: 'a1', name: 'Frontend dev', handle: 'frontend-dev', role: 'Builds the site', avatarUrl: null, coverUrl: null, defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk', approval: 'deferred' },
  now: { state: 'running', lead: { kind: 'running', taskId: 't', key: 'WEB-26', title: 'Generate the sitemap', projectId: 'p', projectName: 'Web', reason: null, since: new Date(Date.now() - 12 * 60_000).toISOString() }, needsYouCount: 0, runningCount: 1, next: null },
  projectCount: 3,
}

vi.mock('wasp/client/operations', () => ({
  getAgentProfile: { name: 'getAgentProfile' },
  getAgentCardHere: { name: 'getAgentCardHere' },
  useQuery: (q: { name: string }) => ({ data: q.name === 'getAgentCardHere' ? cardHere : profile }),
}))
vi.mock('../../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => mobile }))
vi.mock('../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))

import { AgentProfileTrigger } from '../AgentProfileCard'
import { CardPlaceContext, type CardPlace } from '../cardPlace'

beforeEach(() => { cardHere = undefined; mobile = false })

function Where() {
  const l = useLocation()
  return <span data-testid="where">{l.pathname}{l.search}</span>
}

function open(place: CardPlace | null = null, start = '/start') {
  render(
    <MemoryRouter initialEntries={[start]}>
      <Where />
      <Routes>
        <Route path="/start" element={<CardPlaceContext.Provider value={place}><AgentProfileTrigger agentId="a1"><span>Frontend dev</span></AgentProfileTrigger></CardPlaceContext.Provider>} />
        <Route path="/projects/WEB" element={<span>opened the project's message box</span>} />
        <Route path="/chat" element={<span>opened Chat's message box</span>} />
        <Route path="/agents/:handle" element={<span>opened the place</span>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Frontend dev/ }))
  return screen.getByRole('dialog')
}

describe('the profile card @SC-584', () => {
  it('opens from the agent’s name and shows who it is, what it is doing, its projects and its model', () => {
    const card = open()
    expect(card.textContent).toContain('Builds the site · @frontend-dev')
    expect(card.textContent).toContain('Running')
    expect(card.textContent).toContain('Generate the sitemap')
    expect(card.textContent).toContain('In 3 projects')
    expect(card.textContent).toContain('Sonnet')
  })

  it('New conversation opens Chat\'s message box with the agent picked when there is no place', async () => {
    open()
    expect(screen.queryByRole('button', { name: 'Talk to it' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    await waitFor(() => expect(screen.getByText("opened Chat's message box")).toBeTruthy())
    expect(screen.getByTestId('where').textContent).toBe('/chat?agent=a1')
  })

  it('Open its place goes to the agent’s page', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Open its place' }))
    await waitFor(() => expect(screen.getByText('opened the place')).toBeTruthy())
  })

  it('closes on a click outside it', async () => {
    open()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on Escape', async () => {
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('leaves out the part for where you are when there is no place', () => {
    cardHere = { place: { kind: 'chat' }, narrowedCount: 2, openTasks: [] }
    const card = open()
    expect(card.textContent).not.toContain('Your permissions in Chat')
    expect(card.textContent).not.toContain('Permissions here')
  })

  it('opens beside what was tapped on a wide screen, and as a sheet from the bottom on a phone', () => {
    expect(open().style.position).toBe('fixed')
    cleanup()
    mobile = true
    const sheet = open()
    expect(sheet.className).toContain('bottom-0')
    expect(screen.getByTestId('profile-card-scrim')).toBeTruthy()
  })

  describe('in a project @SC-585', () => {
    const project: CardPlace = { kind: 'project', projectId: 'p1', basePath: '/projects/WEB', sessionLocation: { primaryOwnerType: 'project', primaryOwnerId: 'p1' } }
    beforeEach(() => { cardHere = { place: { kind: 'project', projectId: 'p1', personal: false }, narrowedCount: 3, openTasks: [{ id: 't1' }, { id: 't2' }] } })

    it('shows Permissions here and Its tasks here with their counts', () => {
      const card = open(project)
      expect(card.textContent).toContain('Permissions here')
      expect(card.textContent).toContain('3 narrowed')
      expect(card.textContent).toContain('Its tasks here')
      expect(card.textContent).toContain('2 open')
    })

    it('Permissions here opens the agent in the Agents tool at its permissions and closes the card', async () => {
      open(project)
      fireEvent.click(screen.getByRole('button', { name: /Permissions here/ }))
      await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/start?tool=agents&agent=a1&focus=permissions'))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('Its tasks here opens the agent at its tasks', async () => {
      open(project)
      fireEvent.click(screen.getByRole('button', { name: /Its tasks here/ }))
      await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/start?tool=agents&agent=a1&focus=tasks'))
    })

    it('New conversation opens the project\'s message box with the agent picked', async () => {
      open(project)
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
      await waitFor(() => expect(screen.getByText("opened the project's message box")).toBeTruthy())
      expect(screen.getByTestId('where').textContent).toBe('/projects/WEB?agent=a1')
    })
  })

  describe('in Chat @SC-585', () => {
    const chat: CardPlace = { kind: 'chat', basePath: '/chat' }
    beforeEach(() => { cardHere = { place: { kind: 'chat' }, narrowedCount: 2, openTasks: [] } })

    it('shows Your permissions in Chat', () => {
      const card = open(chat)
      expect(card.textContent).toContain('Your permissions in Chat')
      expect(card.textContent).toContain('2 narrowed')
    })

    it('New conversation opens Chat\'s message box with the agent picked', async () => {
      open(chat)
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
      await waitFor(() => expect(screen.getByText("opened Chat's message box")).toBeTruthy())
    })
  })
})
