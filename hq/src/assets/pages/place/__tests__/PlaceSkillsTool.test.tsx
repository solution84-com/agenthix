// @vitest-environment jsdom
/** A place's Skills page: the skills first, the setting folded into one header button, ＋ Add the one way in, All on/off in a group's ⋯. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MAY_ALL, MAY_NONE, skill } from './fixtures'
import type { PlaceSkillsData } from '../placeSkillsModel'

const h = vi.hoisted(() => ({
  getPlaceSkills: Symbol('getPlaceSkills'), getYourSkillsHere: Symbol('getYourSkillsHere'), getWorkspacesAcrossPlaces: Symbol('getWorkspacesAcrossPlaces'),
  place: undefined as unknown, yours: undefined as unknown,
}))
vi.mock('wasp/client/operations', () => ({
  getPlaceSkills: h.getPlaceSkills, getYourSkillsHere: h.getYourSkillsHere, getWorkspacesAcrossPlaces: h.getWorkspacesAcrossPlaces,
  useQuery: (op: symbol) => ({
    data: op === h.getPlaceSkills ? h.place : op === h.getYourSkillsHere ? h.yours : { workspaces: [] }, isLoading: false, error: undefined,
  }),
  scanPlaceSkills: vi.fn(async () => ({})), switchPlaceSkill: vi.fn(), switchAllPlaceSkills: vi.fn(), publishPlaceSkillFiles: vi.fn(),
  putBackPlaceSkillVersion: vi.fn(), removePlaceSkill: vi.fn(), setPlaceSkillsDefault: vi.fn(),
  getLibraryAssets: Symbol('getLibraryAssets'), addSkillToPlace: vi.fn(),
}))
vi.mock('../../review/ProposalsWaiting', () => ({ ProjectProposalsWaiting: () => null }))

import { PlaceSkillsTool } from '../PlaceSkillsTool'

afterEach(cleanup)
h.yours = { outsideYourSpace: true, skills: [] }

const data = (over: Partial<PlaceSkillsData> = {}): PlaceSkillsData => ({
  defaults: { placeDefault: null, orgDefault: 'OFF', effective: 'OFF' },
  skills: [
    skill({ id: 'a', name: 'release-notes', origin: { identity: 'x/release-notes', version: '1.1.0' } }),
    skill({ id: 'b', name: 'bug-triage', path: '.agents/skills/bug-triage', status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false }),
  ],
  may: MAY_ALL, ...over,
})
const draw = (isSpace = true) =>
  render(<MemoryRouter><PlaceSkillsTool place={{ projectId: 'p1', name: isSpace ? 'Your space' : 'Website', isSpace, agents: [] }} /></MemoryRouter>)

describe('PlaceSkillsTool @SC-1642 @SC-1647', () => {
  it('lists the skills first, with the count of what needs you, and no boxes of notices', () => {
    h.place = data()
    draw()
    expect(screen.getByTestId('place-skills-counts').textContent).toBe('1 on · 1 need you')
    expect(screen.getAllByTestId('place-skill-row')).toHaveLength(2)
    expect(screen.queryByTestId('place-default-line')).toBeNull()
    expect(screen.queryByTestId('yours-banner')).toBeNull()
    expect(screen.queryByText(/Anyone who can write the project's files/)).toBeNull()
  })

  it('folds the setting for skills found in files into one header button that opens in place', () => {
    h.place = data()
    draw()
    const button = screen.getByRole('button', { name: /Skills found in files: off by default/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('place-default-line')).toBeTruthy()
    expect(screen.getByLabelText('Skills found in files')).toBeTruthy()
    expect(screen.getByTestId('yours-banner')).toBeTruthy()
  })

  it('＋ Add is the one way in: From the Library and New skill', () => {
    h.place = data()
    draw()
    expect(screen.queryByRole('button', { name: 'All on' })).toBeNull()
    expect(screen.queryByText('Add to this place')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    expect(screen.getAllByRole('menuitem').map((i) => i.firstChild?.textContent)).toEqual(['From the Library', 'New skill'])
  })

  it('a member who may neither install nor write has no ＋ Add, and a viewer is not told skills need them', () => {
    h.place = data({ may: MAY_NONE })
    draw()
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    expect(screen.getByTestId('place-skills-counts').textContent).toBe('1 on')
  })

  it('All on and All off are in the group\'s ⋯ once, not in the header', () => {
    h.place = data()
    draw()
    const group = screen.getByTestId('place-skill-group')
    fireEvent.click(within(group).getByRole('button', { name: /^More about For every agent/ }))
    expect(screen.getAllByRole('menuitem').map((i) => i.firstChild?.textContent)).toEqual(['All on', 'All off'])
    fireEvent.click(screen.getByRole('menuitem', { name: /^All on/ }))
    expect(screen.getByTestId('confirm-switch-all').textContent).toMatch(/bug-triage/)
  })

  it('a project shows Yours · private to you with one line on clashes', () => {
    h.place = data()
    h.yours = { outsideYourSpace: true, skills: [{ id: 'y', name: 'standup-notes', agentName: null, version: 1, follows: true, setAsideIn: [] }] }
    draw(false)
    const group = screen.getByTestId('yours-group')
    expect(group.textContent).toMatch(/Yours · private to you/)
    expect(group.textContent).toMatch(/The project's skills win a clash/)
    expect(group.textContent).toMatch(/From Your space · on/)
    h.yours = { outsideYourSpace: true, skills: [] }
  })
})
