// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { QueueLevel } from '../queues'

const h = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.data }),
  getSkillProposalQueues: 'getSkillProposalQueues',
}))

import { LibraryReviewLink, ProjectProposalsWaiting } from '../ProposalsWaiting'

const entry = (id: string) => ({ id, name: id, description: '', edits: false, proposedBy: 'Ada', proposedFor: null, createdAt: '', state: 'OPEN' as const, reviewedBy: null, reviewedAt: null })
const level = (l: Partial<QueueLevel>, n: number): QueueLevel => ({
  level: 'project', label: 'Website rebuild', projectId: 'pr1', open: Array.from({ length: n }, (_, i) => entry(`${l.projectId ?? 'o'}${i}`)), decided: [], ...l,
})
const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(cleanup)

describe('proposals waiting for review @SC-1663', () => {
  it("says on a project's Skills page how many wait for that project, with a way to review them", () => {
    h.data = [level({ level: 'organisation', projectId: null, label: 'Org' }, 3), level({}, 2), level({ projectId: 'pr2' }, 5)]
    at(<ProjectProposalsWaiting projectId="pr1" />)
    expect(screen.getByTestId('place-skills-proposals').textContent).toBe('2 proposals waiting · Review')
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/library/proposals')
  })

  it('says nothing on a project with none', () => {
    h.data = [level({ projectId: 'pr2' }, 5), level({}, 0)]
    at(<ProjectProposalsWaiting projectId="pr1" />)
    expect(screen.queryByTestId('place-skills-proposals')).toBeNull()
  })

  it("gives the Library's header a way to the queue when anything waits at any level, and none when nothing does", () => {
    h.data = [level({}, 1), level({ level: 'person', projectId: null, label: 'Your space' }, 1)]
    const { unmount } = at(<LibraryReviewLink className="x" />)
    expect(screen.getByRole('link', { name: 'Review (2)' }).getAttribute('href')).toBe('/library/proposals')
    unmount()
    h.data = [level({}, 0)]
    at(<LibraryReviewLink className="x" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
