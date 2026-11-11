// @vitest-environment jsdom
/** A task template's proposal and the workforce review keep their content while a refresh fails, and say Not up to date (C3). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const h = vi.hoisted(() => ({ reads: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getTaskTemplateProposal: 'getTaskTemplateProposal', acceptTaskTemplateProposal: 'x', rejectTaskTemplateProposal: 'x',
  getWorkforceTemplate: 'getWorkforceTemplate', getExistingAgentHandles: 'getExistingAgentHandles', getWorkforceReviewTask: 'getWorkforceReviewTask',
  applyWorkforceTemplate: 'x', confirmWorkforceTemplate: 'x', saveWorkforceDraft: 'x',
  useQuery: (name: string) => h.reads[name] ?? { data: undefined, refetch: vi.fn() },
  useAction: () => vi.fn(),
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../../components/TaskTemplateHolds', () => ({ TaskTemplateHolds: () => <p>Holds</p> }))

import { TaskTemplateProposalPage } from '../TaskTemplateProposalPage'
import { WorkforceReviewPage } from '../WorkforceReviewPage'

afterEach(cleanup)
const down = Object.assign(new Error('Failed to fetch'), { statusCode: undefined })
const old = () => Date.now() - 5 * 60_000

describe('held pages that say Not up to date @SC-1910 @SC-1930', () => {
  it('the task template proposal keeps the proposal and says it above', () => {
    h.reads.getTaskTemplateProposal = {
      data: { id: 'p1', title: 'Bug triage', identity: 'fernhill/bug-triage', description: 'Triage.', state: 'OPEN', digest: 'd', createdAt: '2026-11-01T10:00:00Z', mayReview: true, holds: {} },
      error: down, dataUpdatedAt: old(), refetch: vi.fn(),
    }
    render(<MemoryRouter initialEntries={['/p/p1']}><Routes><Route path="/p/:proposalId" element={<TaskTemplateProposalPage />} /></Routes></MemoryRouter>)
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
    expect(screen.getByText('Holds')).toBeTruthy()
  })

  it('the workforce review keeps the template and says it above', () => {
    h.reads.getWorkforceTemplate = {
      data: { id: 't1', name: 'Support team', description: 'A team.', content: { teams: [], agents: [], projects: [] } },
      error: down, dataUpdatedAt: old(), refetch: vi.fn(), isLoading: false,
    }
    h.reads.getExistingAgentHandles = { data: [], refetch: vi.fn() }
    render(<MemoryRouter initialEntries={['/r?templateId=t1']}><Routes><Route path="/r" element={<WorkforceReviewPage />} /></Routes></MemoryRouter>)
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
    expect(screen.getByText('Support team')).toBeTruthy()
  })
})
