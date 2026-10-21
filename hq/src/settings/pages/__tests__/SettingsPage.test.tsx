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
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, breadcrumbs }: { children: React.ReactNode; breadcrumbs: { label: string }[] }) => (
    <div data-testid="layout" data-crumbs={breadcrumbs.map(b => b.label).join(' / ')}>{children}</div>
  ),
}))
vi.mock('../../../org/pages/people/PersonNameAndPicture', () => ({
  PersonNameAndPicture: ({ person }: { person: { name: string } }) => <div>{person.name}</div>,
}))
vi.mock('../../../model-access/pages/ModelAccessSection', () => ({
  ModelAccessSection: (p: { ownerType: string; ownerId: string }) => <div data-testid="model-logins">{p.ownerType}:{p.ownerId}</div>,
}))
vi.mock('../../../model-policy/components/ModelPolicyForm', () => ({
  ModelPolicyForm: (p: { scope: string }) => <div data-testid="models-form">{p.scope}</div>,
}))
vi.mock('../../../conversations/components/PrimaryAgentSection', () => ({ PrimaryAgentSection: () => <div /> }))
vi.mock('../TimezoneSection', () => ({ TimezoneSection: () => <div /> }))
vi.mock('../AppearanceSection', () => ({ AppearanceSection: () => <div /> }))
vi.mock('../BusyConversationSection', () => ({ BusyConversationSection: () => <div /> }))
vi.mock('../CloudAccountRow', () => ({ CloudAccountRow: () => <div /> }))
vi.mock('../ChangePasswordForm', () => ({ ChangePasswordForm: () => <form aria-label="Change your password" /> }))

import { SettingsPage } from '../SettingsPage'

beforeEach(() => {
  cleanup()
  h.useQuery.mockImplementation((query: string) =>
    query === 'getUserSettings'
      ? { data: { role: h.role, createdAt: '2026-09-03T00:00:00.000Z' } }
      : { data: { person: { userId: 'u1', name: 'Avery', handle: 'avery', avatarUrl: null } } },
  )
})

const headings = () => screen.getAllByRole('heading', { level: 2 }).map(el => el.textContent)

describe('Settings is one page of the person’s own', () => {
  it('shows the sections in order under the person’s name, with nothing for admins', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.getByTestId('layout').getAttribute('data-crumbs')).toBe('Settings')
    expect(screen.getByText('Avery')).toBeTruthy()
    expect(screen.getByText(/^Admin · in Agenthix since/)).toBeTruthy()
    expect(headings()).toEqual([
      'Profile', 'Appearance', 'Conversations', 'Primary agent', 'Models', 'Your model logins', 'Memory', 'Devices and connections', 'Sign-in',
    ])
    expect(screen.getByText('@avery · your sign-in name')).toBeTruthy()
    expect(screen.getByTestId('models-form').textContent).toBe('user')
    expect(screen.getByTestId('model-logins').textContent).toBe('user:u1')
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
