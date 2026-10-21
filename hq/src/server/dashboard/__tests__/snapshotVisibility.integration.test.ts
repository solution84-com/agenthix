// The dashboard snapshot is composed for one viewer (SC-395, SC-402), against
// the real test database: a count or a feed entry that included a private
// project would tell a non-member it exists. The run figures come from the
// sites, which answer nothing here; the activity feed is the shared fake.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createSession, createUser, createTestTask } from '../../../test/factories'
import * as activityFeed from '../../../test/fakes/activity'

vi.mock('../../../sites/combinedRead', () => ({
  askEverySite: vi.fn().mockResolvedValue({ answers: [], unanswered: [] }),
}))
vi.mock('../activity', () => import('../../../test/fakes/activity'))

import { composeSnapshot } from '../snapshot'

let viewer: { id: string }
let open: { id: string }
let listed: { id: string }
let secret: { id: string }

let taskNumber = 0
const task = (projectId: string, data: Record<string, unknown> = {}) =>
  createTestTask({ data: { title: 't', projectId, number: ++taskNumber, onBehalfOfUserId: 'x', ...data } as any })

beforeEach(async () => {
  viewer = await createUser()
  open = await createProject({ accessLevel: 'OPEN', name: 'Open' })
  listed = await createProject({ accessLevel: 'PRIVATE', name: 'Listed' })
  secret = await createProject({ accessLevel: 'PRIVATE', name: 'Secret' })
  await prisma.projectMember.createMany({ data: [open, listed].map(p => ({ projectId: p.id, userId: viewer.id })) })
})

describe('the dashboard totals count only what that viewer may open', () => {
  it('counts and lists only the projects the viewer is entitled to, and only their tasks', async () => {
    await task(open.id)
    await task(listed.id, { status: 'DONE' })
    await task(secret.id)
    await task(secret.id)

    const snap = await composeSnapshot(prisma as any, viewer.id)

    expect(snap.totals.projects).toBe(2)
    expect(snap.totals.tasks).toBe(2)
    expect(snap.recentProjects.map((p) => p.name).sort()).toEqual(['Listed', 'Open'])
    expect(snap.taskCounts).toMatchObject({ total: 2, done: 1, idle: 1 })
  })

  it("counts the viewer's own active chats and the task sessions of projects they may open, not a private project's", async () => {
    await createSession({ userId: viewer.id, sessionType: 'chat', status: 'ACTIVE' })
    await createSession({ sessionType: 'task', status: 'ACTIVE', taskId: (await task(open.id)).id })
    await createSession({ sessionType: 'task', status: 'ACTIVE', taskId: (await task(secret.id)).id })

    const snap = await composeSnapshot(prisma as any, viewer.id)

    expect(snap.totals.activeSessions).toBe(2)
  })
})

// e0-e4 name a private project the viewer is NOT entitled to; e5-e9 name none;
// e10-e14 name one they are. Filtering after slicing to the display limit (10)
// would leave 5 entries; filtering the whole feed first backfills to 10.
describe('recentActivity is filtered by project entitlement before it is sliced to the display limit', () => {
  const entry = (id: string, projectId?: string) =>
    ({ id, timestamp: '2026-01-01T00:00:00Z', type: 'other' as const, summary: id, relatedId: id, projectId })

  beforeEach(() => {
    activityFeed.seedActivity([
      ...Array.from({ length: 5 }, (_, i) => entry(`priv-${i}`, secret.id)),
      ...Array.from({ length: 5 }, (_, i) => entry(`org-${i}`)),
      ...Array.from({ length: 5 }, (_, i) => entry(`pub-${i}`, open.id)),
    ])
  })

  it('backfills entitled entries from past the raw top 10 rather than shortening the feed', async () => {
    const snap = await composeSnapshot(prisma as any, viewer.id)
    expect(snap.recentActivity.map((a) => a.id)).toEqual([
      'org-0', 'org-1', 'org-2', 'org-3', 'org-4',
      'pub-0', 'pub-1', 'pub-2', 'pub-3', 'pub-4',
    ])
  })

  it('never leaks the internal projectId field onto the client-facing entry', async () => {
    const snap = await composeSnapshot(prisma as any, viewer.id)
    for (const e of snap.recentActivity) expect(e).not.toHaveProperty('projectId')
  })
})
