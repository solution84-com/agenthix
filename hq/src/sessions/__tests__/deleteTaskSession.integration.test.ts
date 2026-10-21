import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole, createAgent, createSession } from '../../test/factories'

// Covers SC-074 — "User can delete a session (cancelling its active runs
// first)." Surfaced by the site discovery audit as F-005. This is a data-path
// concern the mocked unit suite cannot prove — so it runs at the integration
// level against the real test DB (ADR-0035).
//
// plan 5d-2 task 9b: the active-run read/cancel and the session delete itself
// all cross the channel now (site holds AgentRun) — siteRuntimeStore and
// dispatchService's site resolver are mocked, same as this suite already
// mocked the in-process agentEngine before the dispatch flip.
//
// @SC-346 — SITE-FIRST: site's own session.delete is called BEFORE hq's
// AgentSession row disappears; a site failure aborts and leaves both intact.
//
// The `@SC-074` tag on the describe is the scenario-coverage citation (the
// audit greps `@SC-NNN` to measure which scenarios have a test).

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))

vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { deleteTaskSession } from '../actions'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

// Minimal Wasp action context: the authenticated user plus the entity
// delegates the action touches, backed by the real test Prisma client.
function ctx(user: { id: string } | undefined) {
  return {
    user,
    entities: { AgentSession: prisma.agentSession },
  } as any
}

/** The session as its site holds it, with the given runs. */
function onSite(sessionId: string, runs: Array<{ id: string; status: 'RUNNING' | 'COMPLETED' }> = []) {
  siteStore.addSession(SITE, { id: sessionId })
  for (const run of runs) siteStore.addRun(SITE, { ...run, sessionId })
}

async function hqCopy(sessionId: string) {
  return prisma.agentSession.findUnique({ where: { id: sessionId } })
}

describe('deleteTaskSession @SC-074 @SC-346', () => {
  it('cancels only the active runs, then deletes site-first, then the hq copy', async () => {
    const user = await createUserWithRole('MEMBER')
    const agent = await createAgent()
    const session = await createSession({ userId: user.id, agentId: agent.id })
    onSite(session.id, [{ id: 'run-running', status: 'RUNNING' }, { id: 'run-done', status: 'COMPLETED' }])

    // Recorded as each step happens: the run's state when the site delete
    // arrives, and whether hq's copy was still there then.
    let atSiteDelete: { runStatus?: string; hqCopyPresent: boolean } | undefined
    siteStore.deleteSession.mockImplementationOnce(async (siteId, id) => {
      atSiteDelete = { runStatus: (await siteStore.getRun(siteId, 'run-running'))?.status, hqCopyPresent: !!(await hqCopy(id)) }
      return { deleted: true }
    })

    await deleteTaskSession({ sessionId: session.id }, ctx(user))

    expect(siteStore.cancelledRuns).toEqual([{ siteId: SITE, runId: 'run-running' }])
    expect(atSiteDelete).toEqual({ runStatus: 'CANCELLED', hqCopyPresent: true })
    expect(await hqCopy(session.id)).toBeNull()
  })

  it('deletes a session with no active runs without cancelling anything', async () => {
    const owner = await createUserWithRole('MEMBER')
    const session = await createSession({ userId: owner.id })
    onSite(session.id)

    await deleteTaskSession({ sessionId: session.id }, ctx(owner))

    expect(siteStore.cancelledRuns).toEqual([])
    expect(await siteStore.getSession(SITE, session.id)).toBeNull()
    expect(await hqCopy(session.id)).toBeNull()
  })

  it('rejects an unauthenticated caller and deletes nothing', async () => {
    const session = await createSession()
    onSite(session.id, [{ id: 'run-running', status: 'RUNNING' }])

    await expect(deleteTaskSession({ sessionId: session.id }, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })

    expect(siteStore.cancelledRuns).toEqual([])
    expect(await siteStore.getSession(SITE, session.id)).not.toBeNull()
    expect(await hqCopy(session.id)).not.toBeNull()
  })

  // @SC-346 — a site failure aborts BEFORE the hq copy delete.
  it('a site delete failure aborts before the hq copy disappears', async () => {
    const user = await createUserWithRole('MEMBER')
    const session = await createSession({ userId: user.id })
    onSite(session.id)
    const { SiteUnreachableError } = await import('../../storage/workspaceStore')
    siteStore.deleteSession.mockRejectedValueOnce(new SiteUnreachableError('Local Site', SITE, 'offline'))

    await expect(deleteTaskSession({ sessionId: session.id }, ctx(user))).rejects.toMatchObject({ statusCode: 503 })

    expect(await hqCopy(session.id)).not.toBeNull()
  })

  // Defect: the active-run read before the delete is not wrapped, so a site that
  // is down when it is asked surfaces as a bare SiteUnreachableError (a 500)
  // rather than the explicit 503 every other site-touching action returns.
  it.fails('a site that cannot be reached at all surfaces as 503, and the hq copy stays', async () => {
    const user = await createUserWithRole('MEMBER')
    const session = await createSession({ userId: user.id })
    siteStore.makeSiteUnreachable(SITE)

    await expect(deleteTaskSession({ sessionId: session.id }, ctx(user))).rejects.toMatchObject({ statusCode: 503 })
    expect(await hqCopy(session.id)).not.toBeNull()
  })

  // A person's own conversation is theirs to delete, whatever their organisation role (adr-0102).
  it('lets the owner delete their own conversation, whatever their organisation role', async () => {
    const owner = await createUserWithRole('MEMBER')
    const session = await createSession({ userId: owner.id })
    onSite(session.id, [])

    await deleteTaskSession({ sessionId: session.id }, ctx(owner))

    expect(await hqCopy(session.id)).toBeNull()
  })

  it('answers a session that does not exist with nothing to do', async () => {
    const owner = await createUserWithRole('MEMBER')
    await expect(deleteTaskSession({ sessionId: 'no-such-session' }, ctx(owner))).resolves.toBeUndefined()
  })
})
