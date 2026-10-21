import { type GetSession, type GetTaskSessions, type GetTaskSession, type GetRecentActivity } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import type { RunRow, TaskIdArgs, TaskSessionView } from '@agenthix/core'
import { resolveSessionLocationDisplay } from './sessionLocationDisplay'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from './siteRuntimeStore'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import type { SessionLocationFields } from '../storage/primaryLocationService'
import { canSeeTask, requireTaskVisible } from '../projects/resourceEntitlement'
import { entitledProjectsFilter } from '../projects/membership'
import { siteReadSilences } from './siteReadSilence'
import { canReachSessionContent } from './sessionEntitlement'
import { readConversation } from './conversationRead'
import { withRunStarters } from './runStarters'
import { taskSessionView } from './taskSessionWire'

type GetSessionArgs = { id: string }

export const getSession: GetSession<GetSessionArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const session = await context.entities.AgentSession.findUnique({
    where: { id: args.id },
    include: {
      agent: { select: { id: true, name: true, defaultModel: true, runtime: true, avatarUrl: true, voiceEnabled: true, voiceId: true, voiceTtsModel: true } },
    },
  })

  // Ownership decided ENTIRELY from hq's own copy, before any site call
  // (SC-354 — a non-owner must be refused without the transcript ever being
  // requested off the wire).
  if (!session || session.userId !== context.user.id) {
    throw new HttpError(404, 'Session not found')
  }

  // @SC-344 — the transcript now lives on site; an unreachable site fails
  // this single-session read explicitly (503) rather than silently
  // returning an empty conversation.
  // Finding 1: `{ tail: true, limit: 1000 }` — the newest 1000 entries, not
  // the oldest 500 (transcriptList's old default), so a chat longer than the
  // cap never reverts to a stale prefix on reload; dropping the oldest
  // history is the correct degradation for a chat UI, not dropping the
  // messages the user just sent.
  let record
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    record = await readConversation(siteId, session.id, context.user.id)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }

  // Working-context badge for the chat screen (ADR-0039 §8): where this session's cwd is.
  const primaryLocation = await resolveSessionLocationDisplay(session)

  return { ...session, entries: record.entries, conversation: record.conversation, primaryLocation }
}

export const getTaskSessions: GetTaskSessions<void, any[]> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  // A task-scoped session is filtered to the projects this caller is entitled
  // to, through the task relation — one query, not a membership check per row
  // (same shape as getAllTasks). A chat session (taskless) never matches.
  const sessions = await context.entities.AgentSession.findMany({
    where: { taskId: { not: null }, task: { project: entitledProjectsFilter(context.user.id) } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      agent: { select: { id: true, name: true, handle: true, avatarUrl: true } },
      task: { select: { id: true, title: true, runState: true, number: true, project: { select: { key: true } } } },
    },
  })

  // As getSessions: a session whose site cannot be asked keeps its row, and
  // carries `siteSilence` rather than reading as a session that never ran.
  const silenceOf = siteReadSilences()
  return Promise.all(
    sessions.map(async (session: SessionLocationFields & { id: string; taskId: string | null; agentId: string }) => {
      let siteId: string
      try {
        siteId = await dispatchService.resolveSiteIdForSession(session)
      } catch {
        return { ...session, AgentRun: [] }
      }
      try {
        const [latest] = await siteRuntimeStore.listRuns(siteId, { sessionId: session.id, limit: 1 })
        return {
          ...session,
          AgentRun: latest
            ? [{ id: latest.id, status: latest.status, manifestStatus: latest.manifestStatus, startedAt: latest.startedAt, endedAt: latest.endedAt }]
            : [],
        }
      } catch (err) {
        return { ...session, AgentRun: [], siteSilence: await silenceOf(siteId, err) }
      }
    }),
  )
}

// Task sessions are viewable by any authenticated user who can see the task's
// project — they are org activity, owned by an arbitrary admin. Chat sessions are the exception:
// owner-only, ADMIN included (ADR-0041).
export const getActivitySession: any = async (args: { sessionId: string }, context: any) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const session = await context.entities.AgentSession.findUnique({
    where: { id: args.sessionId },
    include: {
      agent: { select: { id: true, name: true, runtime: true, avatarUrl: true } },
      task: { select: { id: true, title: true, number: true, project: { select: { key: true } } } },
    },
  })
  if (!session) throw new HttpError(404, 'Session not found')
  // Ownership decided from hq's own copy before any site call (SC-354).
  // A task-scoped session (taskId set) is reachable by its project's members,
  // not by anyone signed in — the arbitrary-administrator `userId` on the row
  // grants nothing. A chat session stays owner-only (ADR-0041).
  if (session.taskId) {
    await requireTaskVisible(session.taskId, context.user.id, 'Session not found')
  } else if (!(await canReachSessionContent(session, context.user.id))) {
    // Taskless: a chat is its owner's, and so is a personal project's task
    // session whose task was deleted — it never becomes org activity (spec §4).
    throw new HttpError(404, 'Session not found')
  }

  let record
  let latestRun
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    ;[record, [latestRun]] = await Promise.all([
      readConversation(siteId, session.id, context.user.id),
      siteRuntimeStore.listRuns(siteId, { sessionId: session.id, limit: 1 }),
    ])
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }

  return {
    ...session,
    entries: record.entries,
    conversation: record.conversation,
    AgentRun: latestRun
      ? [{ id: latestRun.id, status: latestRun.status, manifestStatus: latestRun.manifestStatus }]
      : [],
  }
}

export const getTaskRuns: any = async ({ taskId }: { taskId: string }, context: any) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // No session row to resolve here (this reads run history straight off the
  // task) — a task's own project entitlement is the rule directly, ahead of
  // any site call, so a refused caller never reaches the site (SC-354's
  // discipline applied to this read too).
  await requireTaskVisible(taskId, context.user.id)
  const siteId = await dispatchService.resolveSiteIdForTask(taskId)
  // Finding 2 (SC-344): wrapped so an unreachable site surfaces as an
  // explicit 503, not a bare 500.
  let runs: RunRow[]
  try {
    runs = await siteRuntimeStore.listRuns(siteId, { taskId, limit: 20 })
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  const agentIds = [...new Set(runs.map((r) => r.agentId))]
  const agents = await context.entities.Agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, handle: true, avatarUrl: true },
  })
  const agentById = new Map(agents.map((a: { id: string }) => [a.id, a]))
  return runs.map((r) => ({ ...r, agent: agentById.get(r.agentId) ?? null }))
}

export const getTaskSession: GetTaskSession<TaskIdArgs, TaskSessionView | null> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (!taskId) return null

  const session = await context.entities.AgentSession.findUnique({ where: { taskId } })
  // A task the caller cannot see answers null, exactly as a task with no
  // session (or no such task) does — the one answer this read already gives
  // for "nothing to show you", so it confirms nothing.
  if (!session || !(await canSeeTask(taskId, context.user.id))) return null

  const siteId = await dispatchService.resolveSiteIdForTask(taskId)
  // Finding 2 (SC-344): wrapped so an unreachable site surfaces as an
  // explicit 503, not a bare 500. Finding 1: tail read for the full transcript.
  let record
  let runs: RunRow[]
  try {
    ;[record, runs] = await Promise.all([
      readConversation(siteId, session.id, context.user.id),
      // By session, not task: a message sent into the session starts a run that carries no task.
      siteRuntimeStore.listRuns(siteId, { sessionId: session.id }),
    ])
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }

  // Every viewer sees who sent each message; their own read as "You" (spec §3).
  // run.list is always newest-first (core's RunListFilter contract); shown oldest-first.
  const shownRuns = await withRunStarters(
    [...runs].reverse().map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, endedAt: r.endedAt, usage: r.usage, metadata: r.metadata })),
    context.user.id,
  )
  return taskSessionView(session, record, shownRuns)
}

// getRecentActivity moved to runFeedQueries.ts for the same
// reason and by the same pattern: they are the two reads that belong to no
// single site, they share the merged feed and its page sizes, and keeping them
// here pushed this file past the repo's file-size rule. Re-exported so
// main.wasp.ts's existing `./src/sessions/queries` paths keep working unchanged.
export { getRecentActivity } from './runFeedQueries'
