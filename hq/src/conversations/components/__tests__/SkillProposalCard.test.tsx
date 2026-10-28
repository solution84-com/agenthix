// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SkillDraftCardView, SkillProposalView } from '../../../assets/proposals/view'
import { SkillDraftCard, SkillProposalCard } from '../SkillProposalCard'

afterEach(cleanup)

const proposal = (over: Partial<SkillProposalView> = {}): SkillProposalView => ({
  id: 'p1', name: 'checkout-review', description: 'Review a checkout change.', why: 'Reviews went well.', aim: 'PROJECT',
  placeName: 'Website rebuild', edits: null, makesCopy: false, state: 'OPEN', digest: 'd'.repeat(64), proposedBy: 'Ada',
  proposedFor: 'Avery Chen', reviewers: "Website rebuild's administrators", reviewedBy: null, reviewNote: null, reviewedAt: null,
  createdAt: '2026-10-27T10:00:00.000Z', files: [{ path: 'SKILL.md', text: '---\nname: checkout-review\n---\n1. Read it.' }],
  changes: null, mayReview: false, mayAim: false, aims: [], ...over,
})
const actions = () => ({ busy: false, error: null, onAccept: vi.fn(), onReject: vi.fn(), onAim: vi.fn() })

describe('a proposed skill\'s card (board C3)', () => {
  it('says what it is, for whom, who proposed it and who reviews it, and offers no review to others', () => {
    render(<SkillProposalCard proposal={proposal()} actions={actions()} />)
    expect(screen.getByText(/Proposed skill · checkout-review/)).toBeTruthy()
    expect(screen.getByText(/For Website rebuild · New skill · 1 file · Proposed by Ada, for Avery Chen/)).toBeTruthy()
    expect(screen.getByTestId('skill-proposal-outcome').textContent).toBe("Waiting for review by Website rebuild's administrators")
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  it('lets a reviewer accept, edit first, or reject with a note', () => {
    const a = actions()
    render(<SkillProposalCard proposal={proposal({ mayReview: true })} actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(a.onAccept).toHaveBeenCalledWith(null, '')
    fireEvent.click(screen.getByRole('button', { name: 'Edit first' }))
    fireEvent.change(screen.getByLabelText('SKILL.md'), { target: { value: 'edited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(a.onAccept).toHaveBeenLastCalledWith('edited', '')
    fireEvent.click(screen.getByRole('button', { name: 'Not accepted…' }))
    const reject = screen.getByRole('button', { name: 'Not accepted' }) as HTMLButtonElement
    expect(reject.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Why it isn't accepted"), { target: { value: 'We have one.' } })
    fireEvent.click(reject)
    expect(a.onReject).toHaveBeenCalledWith('We have one.')
  })

  it('shows the outcome once reviewed', () => {
    render(<SkillProposalCard proposal={proposal({ state: 'REJECTED', reviewedBy: 'Sam Rivera', reviewNote: 'Add it to Review a release.' })} actions={actions()} />)
    expect(screen.getByTestId('skill-proposal-outcome').textContent).toBe('Not accepted by Sam Rivera: "Add it to Review a release."')
  })

  it('shows every file, scripts included, before Accept is offered', () => {
    const a = actions()
    render(<SkillProposalCard proposal={proposal({ mayReview: true, files: [...proposal().files, { path: 'scripts/check.sh', text: 'curl x' }] })} actions={a} />)
    expect((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show every file' }))
    expect(screen.getByTestId('skill-proposal-file').textContent).toContain('curl x')
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(a.onAccept).toHaveBeenCalled()
  })

  it('offers Add to my skills for a skill aimed at the person', () => {
    render(<SkillProposalCard proposal={proposal({ aim: 'PERSON', mayReview: true })} actions={actions()} />)
    expect(screen.getByRole('button', { name: 'Add to my skills' })).toBeTruthy()
  })
})

describe('a draft change\'s card (D24)', () => {
  const draft = (over: Partial<SkillDraftCardView> = {}): SkillDraftCardView => ({
    name: 'fernhill/code-review', revision: 3, published: '1.2.0', mayPublish: true, openHref: '/library', ...over,
  })

  it('offers Open draft, and Publish with a note to who may publish the revision shown', () => {
    const onPublish = vi.fn()
    render(<SkillDraftCard name="code-review" shownRevision={3} draft={draft()} busy={false} error={null} onPublish={onPublish} />)
    expect(screen.getByRole('link', { name: 'Open draft' }).getAttribute('href')).toBe('/library')
    fireEvent.click(screen.getByRole('button', { name: 'Publish…' }))
    fireEvent.change(screen.getByLabelText('What changed'), { target: { value: 'Accessibility step' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(onPublish).toHaveBeenCalledWith('Accessibility step')
  })

  it('offers no Publish when the draft moved on since the card, or the person may not publish', () => {
    render(<SkillDraftCard name="code-review" shownRevision={2} draft={draft()} busy={false} error={null} onPublish={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    cleanup()
    render(<SkillDraftCard name="code-review" shownRevision={3} draft={draft({ mayPublish: false })} busy={false} error={null} onPublish={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
  })
})
