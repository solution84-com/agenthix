import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUser } from '../../../test/factories'
import { composeSnapshot } from '../snapshot'
import { recordActivity, __resetForTests } from '../activity'

// The run figures come from the sites over the channel; this suite is about
// which activity entries a viewer is shown, so the combined read answers nothing.
vi.mock('../../../sites/combinedRead', () => ({
  askEverySite: vi.fn().mockResolvedValue({ answers: [], unanswered: [] }),
}))

// R-108: "a run happened on a private project" is itself something a non-member
// is not told, so run and session entries record the project like any other
// entry that names one, and the feed filters them the same way. The real ring
// is used here, not a stub, so this also proves the project id survives being
// recorded. Against the real test database: the private project and its one
// member are real rows.
let PRIVATE: string
let MEMBER: string
let OUTSIDER: string

beforeEach(async () => {
  PRIVATE = (await createProject({ accessLevel: 'PRIVATE' })).id
  MEMBER = (await createUser()).id
  OUTSIDER = (await createUser()).id
  await prisma.projectMember.create({ data: { projectId: PRIVATE, userId: MEMBER } })
  __resetForTests()
  recordActivity('agent_added', '@atlas added', 'agent-1')
  recordActivity('run_completed', '@atlas completed run', 'run-private', PRIVATE)
  recordActivity('session_started', '@atlas started a session', 'sess-private', PRIVATE)
  recordActivity('run_completed', '@atlas completed run', 'run-personal')
})

describe('run and session entries follow the project they happened in (R-108)', () => {
  it('hides an entry for a private project from someone not on it', async () => {
    const snap = await composeSnapshot(prisma as never, OUTSIDER)
    expect(snap.recentActivity.map((a) => a.relatedId)).toEqual(['run-personal', 'agent-1'])
  })

  it('keeps an entry for a private project for a member of it', async () => {
    const snap = await composeSnapshot(prisma as never, MEMBER)
    expect(snap.recentActivity.map((a) => a.relatedId)).toEqual(['run-personal', 'sess-private', 'run-private', 'agent-1'])
  })

  it('leaves entries that name no project unaffected', async () => {
    const outsider = await composeSnapshot(prisma as never, OUTSIDER)
    const member = await composeSnapshot(prisma as never, MEMBER)
    for (const id of ['run-personal', 'agent-1']) {
      expect(outsider.recentActivity.some((a) => a.relatedId === id)).toBe(true)
      expect(member.recentActivity.some((a) => a.relatedId === id)).toBe(true)
    }
  })

  it('does not put the project id on the entry sent to the browser', async () => {
    const snap = await composeSnapshot(prisma as never, MEMBER)
    for (const entry of snap.recentActivity) expect(entry).not.toHaveProperty('projectId')
  })
})
