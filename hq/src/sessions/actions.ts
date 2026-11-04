import { type UpdateSession, type ArchiveSession } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from './siteRuntimeStore'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { requireTaskAccess } from '../projects/resourceEntitlement'
import { personalSessionOwner, requireOrphanedSessionAdmin } from './sessionEntitlement'

type UpdateSessionArgs = {
  id: string
  title?: string
  model?: string | null
  /** Refused: a conversation's state changes only where its site changes it (archiveSession). */
  status?: string
}

type ArchiveSessionArgs = { id: string }

export const updateSession: UpdateSession<UpdateSessionArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const session = await context.entities.AgentSession.findUnique({
    where: { id: args.id },
  })

  // A task-scoped session (taskId set) now requires membership of its task's
  // project — the arbitrary routing-admin userId on the row grants nothing
  // (spec §6.4, this task's fix). A session with no task keeps its EXACT
  // pre-existing behaviour: missing-or-not-mine both answer 404, same as
  // ADR-0041's existing test coverage — not this fix's subject, so left alone
  // rather than folded into requireSessionAccess's own 403 for that branch.
  if (!session) {
    throw new HttpError(404, 'Session not found')
  }
  if (session.taskId) {
    await requireTaskAccess(session.taskId, context.user.id, 'Updating this session')
  } else if (session.userId !== context.user.id) {
    throw new HttpError(404, 'Session not found')
  }

  // A status written here would reach hq's copy alone; the site changes it first, through archiveSession.
  if (args.status !== undefined) {
    throw new HttpError(400, 'A conversation is archived with Archive; its status is not changed here. Nothing was changed.')
  }

  // @SC-345 — a title change crosses the channel first; the hq copy is only
  // patched once site's rename acks, using the exact (possibly truncated)
  // value that was sent so the two copies never disagree about truncation.
  let title = args.title
  if (title !== undefined) {
    title = siteRuntimeStore.truncateTitle(title) ?? undefined
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    try {
      await siteRuntimeStore.renameSession(siteId, args.id, args.title!)
    } catch (err) {
      rethrowSiteUnreachableAsHttp(err)
    }
  }

  const updated = await context.entities.AgentSession.update({
    where: { id: args.id },
    data: {
      ...(title !== undefined && { title }),
      ...(args.model !== undefined && { model: args.model }),
    },
  })
  return updated
}

export const archiveSession: ArchiveSession<ArchiveSessionArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const session = await context.entities.AgentSession.findUnique({
    where: { id: args.id },
  })

  // Same split as updateSession above: task-scoped → project membership
  // (403, this task's fix); no task → the original owner-or-404 test,
  // unchanged (existing test coverage already pins a chat session's
  // non-owner staying 404).
  if (!session) {
    throw new HttpError(404, 'Session not found')
  }
  if (session.taskId) {
    await requireTaskAccess(session.taskId, context.user.id, 'Archiving this session')
  } else if (session.userId !== context.user.id) {
    throw new HttpError(404, 'Session not found')
  }

  // Site first, then patch the hq copy from the ack (same order as rename above).
  const siteId = await dispatchService.resolveSiteIdForSession(session)
  try {
    await siteRuntimeStore.archiveSession(siteId, args.id)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }

  const archived = await context.entities.AgentSession.update({
    where: { id: args.id },
    data: { status: 'ARCHIVED' },
  })
  triggerSnapshotPush()
  return archived
}

export const deleteTaskSession = async (args: { sessionId: string }, context: any): Promise<void> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')

  const session = await prisma.agentSession.findUnique({ where: { id: args.sessionId } })
  if (!session) return
  // Same split as stopTaskSession above: a task-less session that is not a
  // chat is a task session whose task was deleted, belongs to no one in
  // particular, and is deleted by its project's admins.
  if (session.taskId) {
    await requireTaskAccess(session.taskId, context.user.id, 'Deleting this session')
  } else if (session.sessionType === 'chat') {
    if (session.userId !== context.user.id) {
      throw new HttpError(403, 'Deleting this session requires being the person this session belongs to')
    }
  } else if (personalSessionOwner(session) !== null) {
    // A personal project's task run, its task deleted: still its person's alone.
    if (personalSessionOwner(session) !== context.user.id) {
      throw new HttpError(403, 'Deleting this session requires being the person this session belongs to')
    }
  } else {
    await requireOrphanedSessionAdmin(session, context.user.id, 'Deleting a session whose task was deleted')
  }

  // @SC-346 — SITE-FIRST: the site-held session (runs + transcript + tool
  // calls) is deleted before hq's own copy, so a site failure aborts here,
  // leaving both copies intact rather than dropping hq's half out from under
  // a session site still holds. A site that cannot be reached is a 503.
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    // Cancel any active runs first
    const activeRuns = await siteRuntimeStore.listRuns(siteId, { sessionId: args.sessionId, activeOnly: true })
    for (const run of activeRuns) {
      await siteRuntimeStore.cancelRun(siteId, run.id)
    }
    await siteRuntimeStore.deleteSession(siteId, args.sessionId)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  await context.entities.AgentSession.delete({ where: { id: args.sessionId } })
}

export { triggerAgentRun, cancelAgentRun, stopTaskSession, stopAllSessions } from './runActions'
