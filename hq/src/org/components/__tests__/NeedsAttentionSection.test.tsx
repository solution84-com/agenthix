// @vitest-environment jsdom
/** Needs attention (every screen reviewed spec §3, Organisation): one action each, Bypassed a fact an admin may acknowledge. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ access: { canTalk: true, fix: null, isAdmin: true } as unknown, items: [] as unknown[] | undefined, acknowledge: vi.fn(), dismiss: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => (q === 'getMyModelAccess' ? { data: ops.access } : { data: ops.items, refetch: ops.refetch }),
  useAction: (fn: string) => (fn === 'acknowledgeBypassedAgents' ? ops.acknowledge : ops.dismiss),
  getNeedsAttention: 'getNeedsAttention', getMyModelAccess: 'getMyModelAccess', acknowledgeBypassedAgents: 'acknowledgeBypassedAgents', dismissNotification: 'dismissNotification',
}))

import { NeedsAttentionSection } from '../NeedsAttentionSection'

const item = (over: Record<string, unknown>) => ({
  key: 'n1', area: 'workplace', type: 'invitations_unanswered', title: '2 invitations unanswered', body: 'Sent a week ago', actionLabel: 'Resend',
  actionUrl: '/org/people?show=invitations', notificationIds: ['n1'], dismissible: false, acknowledgeable: false, createdAt: new Date(), ...over,
})
const show = () => render(<MemoryRouter><NeedsAttentionSection /></MemoryRouter>)

beforeEach(() => { vi.clearAllMocks(); ops.items = []; ops.access = { canTalk: true, fix: null, isAdmin: true } })
afterEach(cleanup)

describe('Needs attention @SC-666', () => {
  it('says so when nothing needs the admin', () => {
    show()
    expect(screen.getByText('Nothing needs you.')).toBeTruthy()
  })

  it('adds model access to the list while an admin cannot talk to agents, linking to the fix', () => {
    ops.access = { canTalk: false, fix: 'org-access', isAdmin: true }
    show()
    expect(screen.getByText("Agents can't answer yet")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set up model access' }).getAttribute('href')).toBe('/org/settings/model-access')
    expect(screen.getByText('Needs attention · 1')).toBeTruthy()
    expect(screen.queryByText('Nothing needs you.')).toBeNull()
  })

  it('shows no model access item once agents can answer', () => {
    show()
    expect(screen.queryByText("Agents can't answer yet")).toBeNull()
  })

  it('shows an item with its one action as a link', () => {
    ops.items = [item({})]
    show()
    expect(screen.getByText('2 invitations unanswered')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Resend' }).getAttribute('href')).toBe('/org/people?show=invitations')
    expect(screen.getByText('Needs attention · 1')).toBeTruthy()
  })

  it('gives Bypassed a Review link to the agents and an Acknowledge, and no Dismiss @SC-667', async () => {
    ops.items = [item({
      key: 'b', type: 'agents_bypassed', title: '2 agents run with approval Bypassed', actionLabel: 'Review', actionUrl: '/org/agents?approval=bypassed',
      acknowledgeable: true, dismissible: false,
    })]
    show()
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/org/agents?approval=bypassed')
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(ops.acknowledge).toHaveBeenCalled())
    await waitFor(() => expect(ops.refetch).toHaveBeenCalled())
  })

  it('offers Dismiss only for what may be dismissed, and dismisses the notification it stands for', async () => {
    ops.items = [item({ key: 'd', notificationIds: ['n9'], dismissible: true })]
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(ops.dismiss).toHaveBeenCalledWith({ id: 'n9' }))
  })

  it('writes an infrastructure item in the warning colour and a workplace item plainly', () => {
    ops.items = [item({ key: 'a', area: 'infrastructure', title: 'Build server', type: 'site_health' }), item({ key: 'b', title: 'Review the team' })]
    show()
    expect(screen.getByText('Build server').className).toContain('text-warning')
    expect(screen.getByText('Review the team').className).toContain('text-text-primary')
  })
})
