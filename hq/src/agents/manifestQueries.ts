/**
 * manifestQueries
 * ===============
 * Wasp server queries for HITL audit data.
 *
 * getToolCallLog          — returns ToolCallLog rows for a run (ordered by createdAt asc).
 * getSessionPendingManifest — returns the session's newest run when its request is unanswered.
 * getRunManifestStatus      — returns a run's manifestStatus for rendering resolved approval cards.
 *
 * plan 5d-2 task 9b: all three now read through `siteRuntimeStore`, not
 * `prisma.agentRun`/`prisma.toolCallLog` directly (those tables receive no
 * new rows since task 9a's dispatch flip).
 *
 * A run belongs to one session, which belongs to one storage boundary, which
 * sits on one site — so all three are *routed* reads, not combined ones, and
 * all three now resolve their site the same way: via
 * `dispatchService.resolveSiteIdForSession`, keyed off a `sessionId` the
 * caller already has in hand (the runs list carries one per row; the
 * manifest comment sits inside a task's session). `getToolCallLog` and
 * `getRunManifestStatus` used to receive only a runId and resolve to hq's
 * own local site — correct only while a single site could ever be
 * registered. With a second site registered that answered "no such run" for
 * every run not on the first site. Refusing when no `sessionId` is named
 * (rather than falling back to "the first site") is deliberate: a fallback
 * would reintroduce the same bug for exactly the caller that forgot to pass
 * one.
 */
import { HttpError } from 'wasp/server'
import type { GetSessionPendingManifestArgs, GetToolCallLogArgs, PendingManifestView, ToolCallView } from '@agenthix/core'
import { prisma } from 'wasp/server'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import * as dispatchService from './dispatchService'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { canReachSessionContent, type SessionContentFields } from '../sessions/sessionEntitlement'
import type { SessionLocationFields } from '../storage/primaryLocationService'
import { pendingManifestView, toolCallView } from './manifestViews'

// The same rule hq/src/sessions/queries.ts applies to the session behind these
// runs (see getActivitySession), encoded once in sessions/sessionEntitlement.ts:
// a task-scoped session belongs to its task's project (ADR-0062), a chat
// session to the person it is for (ADR-0041, ADMIN included), and a
// task session whose task was deleted to the org. Gating on `sessionType === 'chat'`
// alone — which is what this did — left a private project's task-run tool
// arguments and pending manifest readable by anyone signed in, while the
// browser's own reads of that task refused them.
//
// The refusal stays a 404: a caller cannot tell a run they may not see from
// one that does not exist.
async function assertSessionContentVisible(session: SessionContentFields | null, userId: string): Promise<void> {
  if (!session) return
  if (!(await canReachSessionContent(session, userId))) {
    throw new HttpError(404, 'Not found')
  }
}

/**
 * Resolves the site holding the named session — the routing step every read
 * in this file shares. Refuses rather than guessing: a caller with no
 * session in hand has nothing to route by, and defaulting to "the first
 * site" is exactly the bug this file used to have.
 *
 * Routing only. The returned siteId says which site to ask; it is never used
 * to decide WHO may see the answer — see `sessionBehindRun`'s doc comment for
 * why entitlement re-derives the session from the run instead of trusting
 * this one.
 */
async function resolveSiteForNamedSession(sessionId: string | undefined): Promise<string> {
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpError(400, 'sessionId is required to route this read to the site holding it')
  }
  const routingSession: SessionLocationFields | null = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      sessionType: true,
      taskId: true,
      primaryOwnerType: true,
      primaryOwnerId: true,
      primaryWorkspaceId: true,
    },
  })
  if (!routingSession) throw new HttpError(404, 'Not found')
  return dispatchService.resolveSiteIdForSession(routingSession)
}

/**
 * Deliberately re-derives the session from the RUN itself (`run.sessionId`),
 * never from the caller-supplied `args.sessionId` that `resolveSiteForNamedSession`
 * used to pick the site. That argument is a routing hint only — it decides
 * which site to ask, nothing more — so entitlement below is checked against
 * the run's own actual session. Folding the two together (trusting the
 * caller's session for entitlement too) would let a session the caller may
 * reach vouch for a runId it does not actually own, whenever both happen to
 * live on the same site.
 */
async function sessionBehindRun(siteId: string, runId: string): Promise<{ session: SessionContentFields | null; sessionId: string | null }> {
  const run = await siteRuntimeStore.getRun(siteId, runId)
  if (!run) return { session: null, sessionId: null }
  const session = await prisma.agentSession.findUnique({
    where: { id: run.sessionId },
    select: { userId: true, sessionType: true, taskId: true, primaryOwnerType: true, primaryOwnerId: true },
  })
  // A run whose session row is gone from hq (a half-finished delete) has no owner to check against: it is not shown.
  if (!session) throw new HttpError(404, 'Not found')
  return { session, sessionId: run.sessionId }
}


/** A run's tool calls in order: each with its risk label and, when the site recorded one, the harness's id for the call, which finds its output. */
export const getToolCallLog = async (args: GetToolCallLogArgs, context: any): Promise<ToolCallView[]> => {
  if (!context.user) throw new HttpError(401)
  if (typeof args?.runId !== 'string' || args.runId === '') throw new HttpError(400, 'Name the run')

  try {
    const siteId = await resolveSiteForNamedSession(args.sessionId)
    const { session } = await sessionBehindRun(siteId, args.runId)
    await assertSessionContentVisible(session, context.user.id)
    return (await siteRuntimeStore.listToolCalls(siteId, args.runId)).map(toolCallView)
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowSiteUnreachableAsHttp(err)
  }
}


export const getSessionPendingManifest = async (
  args: GetSessionPendingManifestArgs,
  context: any,
): Promise<PendingManifestView | null> => {
  if (!context.user) throw new HttpError(401)
  if (typeof args?.sessionId !== 'string' || args.sessionId === '') throw new HttpError(400, 'Name the session')

  const session = await prisma.agentSession.findUnique({
    where: { id: args.sessionId },
    select: { userId: true, sessionType: true, taskId: true, agentId: true, primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true },
  })
  await assertSessionContentVisible(session, context.user.id)
  if (!session) return null

  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    // Only the newest run's request still waits: anything newer replaced an older one.
    const [run] = await siteRuntimeStore.listRuns(siteId, { sessionId: args.sessionId, limit: 1 })
    if (run?.manifestStatus !== 'PENDING_APPROVAL') return null
    return pendingManifestView(run)
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowSiteUnreachableAsHttp(err)
  }
}

export const getRunManifestStatus = async (
  args: { runId: string; sessionId: string },
  context: any,
): Promise<{ manifestStatus: string | null } | null> => {
  if (!context.user) throw new HttpError(401)

  try {
    const siteId = await resolveSiteForNamedSession(args.sessionId)
    const run = await siteRuntimeStore.getRun(siteId, args.runId)
    if (!run) return null
    // Entitlement re-derives the session from the run's own `sessionId`, not
    // `args.sessionId` (routing-only — see resolveSiteForNamedSession's doc
    // comment) — same reason sessionBehindRun above does the same thing.
    const session = await prisma.agentSession.findUnique({
      where: { id: run.sessionId },
      select: { userId: true, sessionType: true, taskId: true, primaryOwnerType: true, primaryOwnerId: true },
    })
    if (!session) throw new HttpError(404, 'Not found')
    await assertSessionContentVisible(session, context.user.id)
    return { manifestStatus: run.manifestStatus }
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowSiteUnreachableAsHttp(err)
  }
}
