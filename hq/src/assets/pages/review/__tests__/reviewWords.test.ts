import { describe, expect, it } from 'vitest'
import type { SkillProposalView } from '../../../proposals/view'
import { reviewWords } from '../reviewWords'

const proposal = (over: Partial<SkillProposalView> = {}): SkillProposalView => ({
  id: 'p1', name: 'code-review', description: '', why: '', aim: 'ORGANISATION', placeName: null, edits: 'fernhill/code-review 3', makesCopy: false,
  state: 'OPEN', digest: 'd', proposedBy: 'Ada', proposedFor: 'Avery Chen', reviewers: 'the organisation\'s administrators and Library maintainers',
  reviewedBy: null, reviewNote: null, reviewedAt: null, createdAt: '2026-10-27T10:00:00.000Z', files: [], changes: null,
  mayReview: true, mayAim: false, aims: [], ...over,
})

describe('the review screen\'s words (board R1) @SC-1663', () => {
  it('says an edit to the organisation\'s own skill saves the next version, and names it on the button', () => {
    const w = reviewWords(proposal(), '1.4.0')
    expect(w.heading).toBe('Edit to code-review waiting')
    expect(w.line).toBe('Proposed by Ada for Avery Chen · for the organisation\'s Library')
    expect(w.accepting).toContain('saves a new version of fernhill/code-review (1.4.0)')
    expect(w.acceptLabel).toBe('Accept as version 1.4.0')
  })

  it('says an edit to another publisher\'s skill makes the organisation\'s own copy (A3)', () => {
    const w = reviewWords(proposal({ makesCopy: true, edits: 'agenthix/code-review 1.4.0' }), null)
    expect(w.accepting).toContain("makes the organisation's own copy of agenthix/code-review, which takes the original's place")
    expect(w.acceptLabel).toBe('Accept')
  })

  it('says a new skill is installed as the organisation\'s own and that no agent has it yet (A1)', () => {
    const w = reviewWords(proposal({ edits: null }), '1.0.0')
    expect(w.heading).toBe('New skill code-review waiting')
    expect(w.accepting).toContain("installs it as the organisation's own, version 1.0.0")
    expect(w.accepting).toContain('No agent has it until you give it to them')
  })

  it('says a project\'s proposal is published there, switched on', () => {
    expect(reviewWords(proposal({ aim: 'PROJECT', placeName: 'Website rebuild', edits: null }), null).accepting).toBe('Accepting publishes it into Website rebuild as version 1, switched on.')
  })

  it('reads the outcome of a decided proposal', () => {
    expect(reviewWords(proposal({ state: 'REJECTED', reviewedBy: 'Sam Rivera', reviewNote: 'Keep it out.' }), null).outcome).toBe('Rejected by Sam Rivera: “Keep it out.”')
    expect(reviewWords(proposal({ state: 'ACCEPTED_WITH_CHANGES', reviewedBy: 'Sam Rivera' }), null).outcome).toBe('Accepted with changes by Sam Rivera')
  })
})
