// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ useQuery: vi.fn(), role: 'ADMIN' }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }), logout: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: h.useQuery,
  getUserSettings: 'getUserSettings',
  getPersonCard: 'getPersonCard',
  getMyPledge: 'getMyPledge',
  getFeatures: 'getFeatures',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, breadcrumbs }: { children: React.ReactNode; breadcrumbs: { label: string }[] }) => (
    <div data-testid="layout" data-crumbs={breadcrumbs.map(b => b.label).join(' / ')}>{children}</div>
  ),
}))
vi.mock('../../../org/pages/people/PersonNameAndPicture', () => ({
  PersonNameAndPicture: ({ person }: { person: { name: string } }) => <div>{person.name}</div>,
}))
vi.mock('../../../model-access/pages/ClaudeSubscriptionSection', () => ({
  ClaudeSubscriptionSection: () => <div data-testid="claude-subscription" />,
}))
vi.mock('../../../models-settings/components/OwnList', () => ({ OwnList: () => <div data-testid="own-list" /> }))
vi.mock('../../../conversations/components/PrimaryAgentSection', () => ({ PrimaryAgentSection: () => <div /> }))
vi.mock('../TimezoneSection', () => ({ TimezoneSection: () => <div /> }))
vi.mock('../AppearanceSection', () => ({ AppearanceSection: () => <div /> }))
vi.mock('../BusyConversationSection', () => ({ BusyConversationSection: () => <div /> }))
vi.mock('../AdaptiveVoiceSection', () => ({ AdaptiveVoiceSection: () => <div /> }))
vi.mock('../VoiceSoundsSection', () => ({ VoiceSoundsSection: () => <div /> }))
vi.mock('../CloudAccountRow', () => ({ CloudAccountRow: () => <div data-testid="cloud-account-row" /> }))
vi.mock('../ChangePasswordForm', () => ({ ChangePasswordForm: () => <form aria-label="Change your password" /> }))

import { SettingsPage } from '../SettingsPage'
import { featuresAnswer } from '../../../test/featuresAnswer'
import { withFeature } from '@agenthix/core/testing'

beforeEach(() => {
  cleanup()
  h.useQuery.mockImplementation((query: string) =>
    query === 'getFeatures' ? { data: featuresAnswer() }
    : query === 'getUserSettings'
      ? { data: { role: h.role, createdAt: '2026-09-03T00:00:00.000Z' } }
      : { data: { person: { userId: 'u1', name: 'Avery', handle: 'avery', avatarUrl: null } } },
  )
})

describe('Settings › Sign-in and Agenthix Cloud (adr-0189)', () => {
  it('has no Agenthix account row while Cloud is off', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.queryByTestId('cloud-account-row')).toBeNull()
  })

  withFeature('cloud', () => {
    it('has the Agenthix account row while Cloud is on', () => {
      render(<MemoryRouter><SettingsPage /></MemoryRouter>)
      expect(screen.getByTestId('cloud-account-row')).toBeTruthy()
    })
  })
})

const headings = () => screen.getAllByRole('heading', { level: 2 }).map(el => el.textContent)

describe('Settings is one page of the person’s own @SC-1935', () => {
  it('shows the sections in order under the person’s name, with nothing for admins', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.getByTestId('layout').getAttribute('data-crumbs')).toBe('Settings')
    expect(screen.getByText('Avery')).toBeTruthy()
    expect(screen.getByText(/^Admin · in Agenthix since/)).toBeTruthy()
    expect(headings()).toEqual([
      'Profile', 'Appearance', 'Conversations', 'Voice', 'Primary agent', 'Your Claude subscription', 'Which models may run for you', 'Memory', 'Devices and connections', 'Sign-in',
    ])
    expect(screen.getByText('@avery · your sign-in name')).toBeTruthy()
    expect(screen.getByTestId('claude-subscription')).toBeTruthy()
    for (const admin of ['Execution Sites', 'Model Access', 'Automation', 'Git Integration', 'Site']) {
      expect(screen.queryByRole('link', { name: admin })).toBeNull()
    }
  })

  it('links a phone and connections, and offers a password change and sign out', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Show code' }).getAttribute('href')).toBe('/settings/mobile')
    expect(screen.getAllByRole('link', { name: 'Manage' }).map(l => l.getAttribute('href'))).toEqual(['/settings/memory', '/settings/connections'])
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })
})

describe('Settings when the person card cannot be read', () => {
  it('says so in place of Loading, with Try again', () => {
    const refetch = vi.fn()
    h.useQuery.mockImplementation((query: string) =>
      query === 'getUserSettings'
        ? { data: { role: h.role, createdAt: '2026-09-03T00:00:00.000Z' } }
        : { data: undefined, error: new Error('x'), dataUpdatedAt: 0, refetch })
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByText(/Your name and picture could not be read/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
