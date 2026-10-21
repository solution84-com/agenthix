import { describe, it, expect, vi, beforeEach } from 'vitest'

const pinned = vi.hoisted(() => vi.fn())
const userRow = vi.hoisted(() => vi.fn())
const personalOwner = vi.hoisted(() => vi.fn())

vi.mock('wasp/server', () => ({ prisma: { user: { findUnique: userRow } } }))
vi.mock('../memoryService', () => ({ memoryService: { pinned } }))
vi.mock('../../projects/personalProject', () => ({ personalOwnerOf: personalOwner }))

import { pinnedMemoryForRun } from '../runPinnedMemory'

const recalled = (over: Record<string, unknown> = {}) => ({
  itemId: 'i1', key: 'tea', scope: 'AGENT_PERSON', title: 'Tea', body: 'Prefers tea.', kind: 'PREFERENCE', tags: [],
  pinned: true, writtenAt: '2026-10-16T00:00:00.000Z', ...over,
})

beforeEach(() => {
  pinned.mockReset().mockResolvedValue([recalled()])
  userRow.mockReset().mockResolvedValue({ deactivatedAt: null })
  personalOwner.mockReset().mockResolvedValue(null)
})

describe('the pinned memory a run starts with @SC-992', () => {
  it('is the pinned items of the person the run is for and of its place, with scopes named as the tools name them', async () => {
    const items = await pinnedMemoryForRun({
      agentId: 'ag', personId: 'p1', startedBy: 'person', boundary: { type: 'project', id: 'pr1' }, runnerPersonId: 'p1',
    })

    expect(pinned).toHaveBeenCalledWith({ personId: 'p1', agentId: 'ag', place: { type: 'project', id: 'pr1' } })
    expect(items).toEqual([{ key: 'tea', scope: 'agent_person', title: 'Tea', body: 'Prefers tea.' }])
  })

  it('reads a personal project as its person\'s own space', async () => {
    personalOwner.mockResolvedValue('p9')
    await pinnedMemoryForRun({ agentId: 'ag', personId: 'p1', startedBy: 'person', boundary: { type: 'project', id: 'pr1' }, runnerPersonId: 'p1' })
    expect(pinned).toHaveBeenCalledWith(expect.objectContaining({ place: { type: 'user', id: 'p9' } }))
  })

  it.each(['pulse', 'schedule'] as const)('is for no person on a %s run, even when its task has one: place only', async startedBy => {
    await pinnedMemoryForRun({ agentId: 'ag', personId: 'p1', startedBy, boundary: { type: 'project', id: 'pr1' }, runnerPersonId: 'p1' })
    expect(pinned).toHaveBeenCalledWith({ personId: null, agentId: 'ag', place: { type: 'project', id: 'pr1' } })
    expect(userRow).not.toHaveBeenCalled()
  })

  it('is for a person whose work an agent started, as for a person\'s own start', async () => {
    await pinnedMemoryForRun({ agentId: 'ag', personId: 'p1', startedBy: 'agent', boundary: { type: 'user', id: 'p1' }, runnerPersonId: 'p1' })
    expect(pinned).toHaveBeenCalledWith({ personId: 'p1', agentId: 'ag', place: { type: 'user', id: 'p1' } })
  })

  it('treats a person who has left the organisation as no one', async () => {
    userRow.mockResolvedValue({ deactivatedAt: new Date() })
    await pinnedMemoryForRun({ agentId: 'ag', personId: 'p1', startedBy: 'person', boundary: null, runnerPersonId: 'p1' })
    expect(pinned).toHaveBeenCalledWith({ personId: null, agentId: 'ag', place: null })
  })

  it('is for no person in a home other members\' runs share, a project\'s task run: place only', async () => {
    await pinnedMemoryForRun({
      agentId: 'ag', personId: 'p1', startedBy: 'person', boundary: { type: 'project', id: 'pr1' }, runnerPersonId: null,
    })
    expect(pinned).toHaveBeenCalledWith({ personId: null, agentId: 'ag', place: { type: 'project', id: 'pr1' } })
  })

  it('is for no person in another person\'s home', async () => {
    await pinnedMemoryForRun({ agentId: 'ag', personId: 'p1', startedBy: 'person', boundary: { type: 'user', id: 'p2' }, runnerPersonId: 'p2' })
    expect(pinned).toHaveBeenCalledWith(expect.objectContaining({ personId: null }))
  })
})
