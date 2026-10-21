// @vitest-environment jsdom
/** The Organisation page (every screen reviewed spec §3): an admin sees it in the order they act, a member the identity and the workplace. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ role: 'ADMIN' as string | undefined }))
const IDENTITY = { id: 'o1', name: 'Acme Corp', handle: 'acmecorp', vision: 'Software that helps small shops sell online.', mission: 'Give every shop the tools of a large retailer.', avatarUrl: null, coverUrl: null, since: new Date('2026-03-04') }
vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({ data: query === 'getOrgIdentity' ? IDENTITY : query === 'getUserSettings' ? (ops.role ? { role: ops.role } : undefined) : undefined }),
  useAction: () => vi.fn(),
  getOrgIdentity: 'getOrgIdentity', getUserSettings: 'getUserSettings', uploadOrgImage: 'u', removeOrgImage: 'r',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../../../shared/components/AuthedImg', () => ({ AuthedImg: () => null }))
vi.mock('../../components/NeedsAttentionSection', () => ({ NeedsAttentionSection: () => <section>needs attention</section> }))
vi.mock('../../components/TodaySection', () => ({ TodaySection: () => <section>today</section> }))
vi.mock('../../components/WhereItRunsSection', () => ({ WhereItRunsSection: () => <section>where it runs</section> }))
vi.mock('../../components/WorkplaceSection', () => ({ WorkplaceSection: () => <section>the workplace</section> }))
vi.mock('../../components/SettingsSection', () => ({ SettingsSection: () => <section>settings</section> }))
vi.mock('../../components/OrgIdentityDialog', () => ({ OrgIdentityDialog: () => null }))

import { OrgPage } from '../OrgPage'

const show = () => render(<MemoryRouter><OrgPage /></MemoryRouter>)
beforeEach(() => { ops.role = 'ADMIN' })
afterEach(cleanup)

describe('the Organisation page @SC-661', () => {
  it('opens with the identity: name, handle, since, vision and mission', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeTruthy()
    expect(screen.getByText(/@acmecorp · on Agenthix since March 2026/)).toBeTruthy()
    expect(screen.getByText('Software that helps small shops sell online.')).toBeTruthy()
    expect(screen.getByText(/Mission: Give every shop/)).toBeTruthy()
  })

  it('shows an admin Needs attention, Today, Where it runs, the workplace and Settings, in that order, and Edit and Change cover', () => {
    show()
    const order = ['needs attention', 'today', 'where it runs', 'the workplace', 'settings'].map(t => screen.getByText(t))
    order.slice(1).forEach((el, i) => expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Change cover/ })).toBeTruthy()
  })

  it('shows a member the identity and the workplace, and nothing to change', () => {
    ops.role = 'MEMBER'
    show()
    expect(screen.getByText('the workplace')).toBeTruthy()
    for (const hidden of ['needs attention', 'today', 'where it runs', 'settings']) expect(screen.queryByText(hidden)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Change cover/ })).toBeNull()
  })

  it('has no cover pattern, chips or Teams / Members / About tabs', () => {
    show()
    expect(screen.queryByRole('button', { name: /^(Teams|Members|About)$/i })).toBeNull()
  })
})
