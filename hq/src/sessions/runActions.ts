import { type TriggerAgentRun, type CancelAgentRun, type StopTaskSession } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { MESSAGE_MAX_CHARS, type StopResult, type StopTaskSessionArgs } from '@agenthix/core'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from './siteRuntimeStore'
import { interruptIfBusy } from './busyConversationInterrupt'
import { rethrowDispatchErrorAsHttp, rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { requireTaskAccess } from '../projects/resourceEntitlement'
import { personalSessionOwner, requireOrphanedSessionAdmin, tasklessSessionPerson } from './sessionEntitlement'
import { requireRole } from '../server/identity/requireRole'
import { personName } from './transcriptAuthors'
import { requireSessionSender } from './sessionSender'
import { releaseTaskFromReplacedRequest } from '../agents/manifestRequests'

type TriggerAgentRunArgs = {
  sessionId: string
  inputText: string
}

export const triggerAgentRun: TriggerAgentRun<TriggerAgentRunArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  // Who may send, decided from hq's copy ahead of dispatchChatRun below — a
  // refused caller never reaches the site (sessionSender.ts).
  const session = await requireSessionSender(args.sessionId, context.user.id)

  if (typeof args.inputText !== 'string' || args.inputText.trim() === '') throw new HttpError(400, 'A message cannot be empty. Nothing was sent.')
  if (args.inputText.length > MESSAGE_MAX_CHARS) {
    throw new HttpError(400, `A message can be at most ${MESSAGE_MAX_CHARS} characters. Nothing was sent.`)
  }

  // plan 5d-2 task 9a (the dispatch flip): dispatches to site and returns —
  // the run itself no longer executes in this process. `{ id, status }` is
  // this action's pre-existing return contract (the client only reads `.id`
  // today); dispatchChatRun's own result is `{ runId }`, adapted here rather
  // than widened, since the client contract is what must not change.
  //
  // Task 7 (plan 5f, SC-340's chat half): previously uncaught here —
  // dispatchChatRun's SiteUnreachableError fell through to Express's
  // `finalhandler` default (no `.status`/`.statusCode` on that error type),
  // rendering an opaque 500 HTML stack trace instead of the explicit 503
  // every other site-touching action returns via rethrowSiteUnreachableAsHttp.
  // dispatchChatRun's buildContext also resolves this run's package content
  // and delivers it to the site — a package error
  // (agent with no content, hq's own platform/org package missing, content
  // changed while the run was starting, or a site that failed to store it) is
  // just as person-actionable as a 404, so it maps to 409 the same way,
  // via the shared `rethrowDispatchErrorAsHttp`.
  try {
    // Sending into a busy conversation (person-scoped execution spec §2): WAIT
    // (the default) leaves this a no-op, exactly as before this lane. INTERRUPT
    // stops the session's running turn first — see busyConversationInterrupt.ts
    // for why it is enough that the site has ACKNOWLEDGED the cancel, not that
    // the cancelled turn has actually exited, before dispatching below. A site
    // that cannot be reached to check throws here and is mapped to the same
    // explicit 503 dispatchChatRun's own site-unreachable failures get.
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    await interruptIfBusy(context.user.id, siteId, args.sessionId)

    const { runId } = await dispatchService.dispatchChatRun(
      args.sessionId,
      args.inputText,
      session.agent,
      session.model,
      // The run is on behalf of whoever sent the message — in a task's session,
      // anyone who works in the project (spec §3, equal footing). A person's message is always in the
      // transcript: only hq's own prompts (Try again, Summarise now) are sent hidden, and not through here.
      { senderId: context.user.id },
    )
    // The message replaced any request the task's last run left unanswered (the site did as the run started).
    if (session.taskId) await releaseTaskFromReplacedRequest(session.taskId)

    return { id: runId, status: 'PENDING' }
  } catch (err) {
    rethrowDispatchErrorAsHttp(err)
  }
}

/**
 * A dispatched run's AgentRun row lives on site — hq's schema declares no
 * AgentRun model at all, so there is no `context.entities.AgentRun` to verify
 * ownership against. Widened to take `sessionId` too (the client already has
 * it — this is invoked from a session's own chat panel) so ownership can be
 * verified via hq's session copy instead, and the run's site resolved from
 * there for the cancel call itself.
 */
export const cancelAgentRun: CancelAgentRun<{ runId: string; sessionId: string }, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const session = await prisma.agentSession.findUnique({ where: { id: args.sessionId } })
  // Same split as archiveSession, ahead of every site call below
  // (resolveSiteIdForSession/getRun/cancelRun) — a refused caller must never
  // reach another machine.
  if (!session) {
    throw new HttpError(404, 'Run not found or access denied')
  }
  if (session.taskId) {
    await requireTaskAccess(session.taskId, context.user.id, 'Cancelling this run')
  } else {
    // A task session whose task was deleted is its project's admins' to stop, as stopTaskSession has it.
    const person = tasklessSessionPerson(session)
    if (person === null) await requireOrphanedSessionAdmin(session, context.user.id, 'Cancelling a run whose task was deleted')
    else if (person !== context.user.id) throw new HttpError(404, 'Run not found or access denied')
  }

  // A site that cannot be reached is a 503 with its reason, not a bare 500.
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)

    // Ownership check widened to the run itself:
    // the session check above only proves the caller owns `args.sessionId` — it
    // says nothing about whether `args.runId` actually belongs to it, so a
    // caller could otherwise cancel any run on the site by pairing their own
    // sessionId with a foreign runId. Mirrors resolveManifestRunContext's own
    // getRun-then-compare pattern in manifestActions.ts.
    const run = await siteRuntimeStore.getRun(siteId, args.runId)
    if (!run || run.sessionId !== args.sessionId) {
      throw new HttpError(404, 'Run not found or access denied')
    }

    await siteRuntimeStore.cancelRun(siteId, args.runId, undefined, await personName(context.user.id))
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/**
 * plan 5d-2 task 9b: the active-run read now goes through
 * `siteRuntimeStore.listRuns` — `context.entities.AgentRun` stopped
 * receiving new rows the moment 9a's dispatch flip landed, so it silently
 * found nothing for any run dispatched since.
 */
export const stopTaskSession: StopTaskSession<StopTaskSessionArgs, StopResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')

  const session = await prisma.agentSession.findUnique({ where: { id: args.sessionId } })
  if (!session) return { cancelled: 0 }
  // requireSessionAccess's no-task branch is a plain owner check — right for
  // a chat session, wrong for a task session whose task was deleted: its
  // userId is whichever administrator was picked as a routing identity, not an
  // owner. Nobody reads such a session (canReachSessionContent); stopping a
  // leftover is its project's admins' (R-196).
  if (session.taskId) {
    await requireTaskAccess(session.taskId, context.user.id, 'Stopping this session')
  } else if (session.sessionType === 'chat') {
    if (session.userId !== context.user.id) {
      throw new HttpError(403, 'Stopping this session requires being the person this session belongs to')
    }
  } else if (personalSessionOwner(session) !== null) {
    // A personal project's task run, its task deleted: still its person's alone.
    if (personalSessionOwner(session) !== context.user.id) {
      throw new HttpError(403, 'Stopping this session requires being the person this session belongs to')
    }
  } else {
    await requireOrphanedSessionAdmin(session, context.user.id, 'Stopping a session whose task was deleted')
  }

  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    const activeRuns = await siteRuntimeStore.listRuns(siteId, { sessionId: args.sessionId, activeOnly: true })
    const by = activeRuns.length > 0 ? await personName(context.user.id) : undefined
    for (const run of activeRuns) {
      await siteRuntimeStore.cancelRun(siteId, run.id, undefined, by)
    }
    return { cancelled: activeRuns.length }
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/**
 * plan 5d-2 task 9b: same re-point as stopTaskSession above, but "stop
 * everything" has no single session to resolve a site from — it sweeps
 * every non-revoked registered Execution Site (not just hq's own local
 * one), so an org with more than one site still gets every active run
 * stopped, not only the local machine's.
 */
export const stopAllSessions = async (_args: void, context: any): Promise<{ cancelled: number }> => {
  await requireRole(context, 'ADMIN', 'Stopping every run in the organisation')

  const sites = await prisma.executionSite.findMany({
    where: { status: { not: 'REVOKED' } },
    select: { siteId: true },
  })

  const by = await personName(context.user.id)
  let cancelled = 0
  for (const { siteId } of sites) {
    const activeRuns = await siteRuntimeStore.listRuns(siteId, { activeOnly: true })
    for (const run of activeRuns) {
      await siteRuntimeStore.cancelRun(siteId, run.id, undefined, by)
    }
    cancelled += activeRuns.length
  }

  return { cancelled }
}
