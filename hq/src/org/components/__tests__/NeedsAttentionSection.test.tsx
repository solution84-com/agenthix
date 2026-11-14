// @vitest-environment jsdom
/** Needs attention (every screen reviewed spec §3, Organisation): one action each, Bypassed a fact an admin may acknowledge. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ access: { canTalk: true, fix: null, isAdmin: true, added: { model: true, voice: true } } as unknown, items: [] as unknown[] | undefined, acknowledge: vi.fn(), dismiss: vi.fn(), refetch: vi.fn(), accessError: null as unknown, accessRefetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => (q === 'getMyModelAccess' ? { data: ops.access, error: ops.accessError, refetch: ops.accessRefetch, dataUpdatedAt: 0 } : { data: ops.items, refetch: ops.refetch }),
  useAction: (fn: string) => (fn === 'acknowledgeBypassedAgents' ? ops.acknowledge : ops.dismiss),
  getNeedsAttention: 'getNeedsAttention', getMyModelAccess: 'getMyModelAccess', acknowledgeBypassedAgents: 'acknowledgeBypassedAgents', dismissNotification: 'dismissNotification',
}))

import { NeedsAttentionSection } from '../NeedsAttentionSection'

const item = (over: Record<string, unknown>) => ({
  key: 'n1', area: 'workplace', type: 'invitations_unanswered', title: '2 invitations unanswered', body: 'Sent a week ago', actionLabel: 'Resend',
  actionUrl: '/admin/people?show=invitations', notificationIds: ['n1'], dismissible: false, acknowledgeable: false, createdAt: new Date(), ...over,
})
const show = () => render(<MemoryRouter><NeedsAttentionSection /></MemoryRouter>)

const ADDED = { model: true, voice: true }

beforeEach(() => { vi.clearAllMocks(); ops.accessError = null; ops.items = []; ops.access = { canTalk: true, fix: null, isAdmin: true, added: ADDED } })
afterEach(cleanup)

describe('Needs attention @SC-666 @SC-1932', () => {
  it('says so when nothing needs the admin', () => {
    show()
    expect(screen.getByText('Nothing needs you.')).toBeTruthy()
  })

  it('adds model access to the list while an admin cannot talk to agents, linking to the fix', () => {
    ops.access = { canTalk: false, fix: 'org-access', isAdmin: true, added: ADDED }
    show()
    expect(screen.getByText("Agents can't answer yet")).toBeTruthy()
    expect(screen.getByText('No model provider is working: add one, or fix the one there is')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open AI' }).getAttribute('href')).toBe('/admin/ai#providers')
    expect(screen.getByText('Needs attention · 1')).toBeTruthy()
    expect(screen.queryByText('Nothing needs you.')).toBeNull()
  })

  it('says a model provider was never added, rather than that one stopped working, when setup left models for later @SC-1667', () => {
    ops.access = { canTalk: false, fix: 'org-access', isAdmin: true, added: { model: false, voice: true } }
    show()
    expect(screen.getByText('No model provider has been added. Add one so agents can think')).toBeTruthy()
  })

  it('adds voice not set up while no speech-to-text or text-to-speech provider has been added @SC-1667', () => {
    ops.access = { canTalk: true, fix: null, isAdmin: true, added: { model: true, voice: false } }
    show()
    expect(screen.getByText("Voice isn't set up")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open AI' }).getAttribute('href')).toBe('/admin/ai#providers')
    expect(screen.getByText('Needs attention · 1')).toBeTruthy()
  })

  it('shows no model access item once agents can answer', () => {
    show()
    expect(screen.queryByText("Agents can't answer yet")).toBeNull()
  })

  it('shows an item with its one action as a link', () => {
    ops.items = [item({})]
    show()
    expect(screen.getByText('2 invitations unanswered')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Resend' }).getAttribute('href')).toBe('/admin/people?show=invitations')
    expect(screen.getByText('Needs attention · 1')).toBeTruthy()
  })

  it('gives Bypassed a Review link to the agents and an Acknowledge, and no Dismiss @SC-667', async () => {
    ops.items = [item({
      key: 'b', type: 'agents_bypassed', title: '2 agents run with approval Bypassed', actionLabel: 'Review', actionUrl: '/admin/agents?approval=bypassed',
      acknowledgeable: true, dismissible: false,
    })]
    show()
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/admin/agents?approval=bypassed')
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

  it('says a failed access read as a meta line with Try again, not a block beside the list', () => {
    ops.access = undefined
    ops.accessError = new Error('HQ did not answer')
    show()
    expect(screen.getByText('Nothing needs you.')).toBeTruthy()
    expect(screen.getByText(/Whether agents can answer could not be read/)).toBeTruthy()
    expect(screen.getByRole('status').className).not.toContain('py-16')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(ops.accessRefetch).toHaveBeenCalled()
  })
})
