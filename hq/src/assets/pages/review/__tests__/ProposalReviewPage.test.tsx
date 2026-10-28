// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ProposalReview } from '../proposalReview'

const h = vi.hoisted(() => ({ data: undefined as unknown, accept: vi.fn(), reject: vi.fn(), open: vi.fn() }))
vi.mock('../../../../dock/DockContext', () => ({ useDock: () => ({ openConversation: h.open }) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.data, error: undefined, refetch: vi.fn() }),
  useAction: (op: string) => (op === 'acceptSkillProposal' ? h.accept : h.reject),
  getSkillProposalReview: 'getSkillProposalReview', acceptSkillProposal: 'acceptSkillProposal', rejectSkillProposal: 'rejectSkillProposal',
}))
vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@agenthix/ui/editor', () => ({
  CodeEditor: ({ value, onChange, label }: { value: string; onChange: (t: string) => void; label: string }) => (
    <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
  ),
}))

import { ProposalReviewPage } from '../ProposalReviewPage'

const b64 = (t: string) => Buffer.from(t).toString('base64')
const review = (over: Partial<ProposalReview['proposal']> = {}): ProposalReview => ({
  proposal: {
    id: 'p1', name: 'code-review', description: 'Review a change.', why: 'Avery asked me to check rate limits.', aim: 'ORGANISATION', placeName: null,
    edits: 'fernhill/code-review 3', makesCopy: false, state: 'OPEN', digest: 'd'.repeat(64), proposedBy: 'Ada', proposedFor: 'Avery Chen',
    reviewers: "the organisation's administrators and Library maintainers", reviewedBy: null, reviewNote: null, reviewedAt: null,
    createdAt: '2026-10-27T10:00:00.000Z', files: [], changes: null, mayReview: true, mayAim: false, aims: [], ...over,
  },
  files: [{ path: 'SKILL.md', text: '1. Read.\n2. Check rate limits.', base64: b64('1. Read.\n2. Check rate limits.') }, { path: 'scripts/check.sh', text: 'echo ok', base64: b64('echo ok') }],
  changes: [
    { path: 'SKILL.md', status: 'modified', before: '1. Read.', after: '1. Read.\n2. Check rate limits.', binary: false },
    { path: 'scripts/check.sh', status: 'added', before: null, after: 'echo ok', binary: false },
  ],
  acceptsAs: '1.4.0',
})

const renderPage = () => render(
  <MemoryRouter initialEntries={['/library/proposals/p1']}><Routes><Route path="/library/proposals/:proposalId" element={<ProposalReviewPage />} /></Routes></MemoryRouter>,
)

beforeEach(() => { h.accept.mockReset(); h.reject.mockReset() })
afterEach(cleanup)

describe('reviewing one proposal (board R1)', () => {
  it('shows why, and every file of the change, scripts included', () => {
    h.data = review()
    renderPage()
    expect(screen.getByText('Edit to code-review waiting')).toBeTruthy()
    expect(screen.getByText(/Why, from Ada: “Avery asked me to check rate limits.”/)).toBeTruthy()
    expect(screen.getByLabelText('SKILL.md')).toBeTruthy()
    expect(screen.getByLabelText('scripts/check.sh')).toBeTruthy()
    expect(screen.getByText(/every one shown above, scripts included/)).toBeTruthy()
  })

  it('accepts the content it was shown, by its digest, naming the version', async () => {
    h.data = review()
    h.accept.mockResolvedValue({ state: 'ACCEPTED', version: 'fernhill/code-review 1.4.0' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Accept as version 1.4.0' }))
    await waitFor(() => expect(h.accept).toHaveBeenCalledWith({ proposalId: 'p1', digest: 'd'.repeat(64) }))
    expect((await screen.findByTestId('proposal-done')).textContent).toContain('Accepted: fernhill/code-review 1.4.0')
  })

  it('edits, then accepts: the edited text and the bytes of every other file', async () => {
    h.data = review()
    h.accept.mockResolvedValue({ state: 'ACCEPTED_WITH_CHANGES', version: 'fernhill/code-review 1.4.0' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit, then accept' }))
    fireEvent.change(screen.getByLabelText('Edit SKILL.md'), { target: { value: '1. Read.\n2. Check rate limits, and name them.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accept as version 1.4.0, with my changes' }))
    await waitFor(() => expect(h.accept).toHaveBeenCalledWith({
      proposalId: 'p1', digest: 'd'.repeat(64),
      files: [{ path: 'SKILL.md', text: '1. Read.\n2. Check rate limits, and name them.' }, { path: 'scripts/check.sh', base64: b64('echo ok') }],
    }))
    expect((await screen.findByTestId('proposal-done')).textContent).toContain('Accepted with your changes')
  })

  it('after accepting a new skill into the Library, offers Add to agents… on its page', async () => {
    h.data = review({ edits: null, name: 'release-notes' })
    h.accept.mockResolvedValue({ state: 'ACCEPTED', version: 'fernhill/release-notes 1.0.0', assetId: 'a9' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    const done = await screen.findByTestId('proposal-done')
    expect(done.textContent).toContain('No agent has it yet.')
    expect(screen.getByRole('link', { name: 'Add to agents…' }).getAttribute('href')).toBe('/library/a9')
  })

  it('opens the conversation it came from beside the page, when the viewer may read it', () => {
    h.data = review({ conversationId: 'c1' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Open the conversation' }))
    expect(h.open).toHaveBeenCalledWith('c1', null)
    cleanup()
    h.data = review({ conversationId: null })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Open the conversation' })).toBeNull()
  })

  it('rejects only with a note', async () => {
    h.data = review()
    h.reject.mockResolvedValue({ state: 'REJECTED' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Reject…' }))
    const reject = screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement
    expect(reject.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/A note for Avery Chen and Ada/), { target: { value: 'Rate limits are the security review\'s.' } })
    fireEvent.click(reject)
    await waitFor(() => expect(h.reject).toHaveBeenCalledWith({ proposalId: 'p1', digest: 'd'.repeat(64), note: "Rate limits are the security review's." }))
  })

  it('shows a refusal in place and offers no decision to someone who may not review', async () => {
    h.data = review()
    h.accept.mockRejectedValue(new Error('The proposal changed since you looked at it. Look at it again. Nothing was changed.'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Accept as version 1.4.0' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was changed.')
    cleanup()
    h.data = review({ mayReview: false })
    renderPage()
    expect(screen.queryByRole('button', { name: /Accept/ })).toBeNull()
    expect(screen.getByText(/isn't yours to decide/)).toBeTruthy()
  })

  it('reads the outcome of a decided proposal and offers no buttons', () => {
    h.data = review({ state: 'REJECTED', reviewedBy: 'Sam Rivera', reviewNote: 'Keep it out.', mayReview: false })
    renderPage()
    expect(screen.getByTestId('proposal-outcome').textContent).toBe('Rejected by Sam Rivera: “Keep it out.”')
  })
})
