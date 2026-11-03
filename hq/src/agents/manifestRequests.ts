/**
 * An approval is for the next run only (every-screen-reviewed spec §9). A run never waits for approval: what
 * needs it is refused and listed, and the run ends with the list. A request nobody answered is replaced by
 * anything newer in its task or conversation — a new message, Run again, Dismiss, a newer run — and then leaves
 * Needs you, the Runs panel and the approval card. Only the newest run's request can still be answered.
 *
 * The site replaces a session's unanswered requests itself when it starts a newer run there; Dismiss, and Run
 * again before its run starts, ask it here.
 */
import { prisma } from 'wasp/server'
import type { RunRow } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import * as dispatchService from './dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { markTaskNotificationsHandled } from '../notifications/handled'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { MANIFEST_BLOCKED_REASON } from './taskExecutionReasons'

const logger = new Logger('ManifestRequests')

/** What a person who answers a replaced request is told. */
export const REPLACED_REQUEST_REFUSAL =
  'This request was replaced by something newer in its task or conversation, so it can no longer be approved or denied.'

/** The message, never shown in the conversation, that the run an approval starts is sent; the site puts the approval's note before it. */
export const CONTINUE_AFTER_APPROVAL = 'Please continue.'

/**
 * What the run a conversation's denial starts is sent, never shown in the conversation: what was denied and why,
 * so the agent answers without it (every screen reviewed, *An approval asked mid-run*: the answer starts the next run).
 */
export function continueAfterDenial(request: unknown, reason: string | null): string {
  const r = (request ?? {}) as { tools?: Array<{ name?: unknown }>; bashPatterns?: Array<{ pattern?: unknown; reason?: unknown }> }
  const names = [
    ...(r.tools ?? []).map(t => t.name).filter((n): n is string => typeof n === 'string' && !!n),
    ...(r.bashPatterns ?? []).map(p => p.pattern).filter((p): p is string => typeof p === 'string' && !!p).map(p => `the command \`${p}\``),
  ]
  const what = names.length > 0 ? `: ${names.join(', ')}` : ''
  const why = reason ? ` Their reason: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}` : ''
  return `[A person denied your request to use${what}.${why} Carry on without it, and say what you could not do.]\n\n${CONTINUE_AFTER_APPROVAL}`
}

/** The runs read for a task's unanswered requests: only the newest can be one, but a site that missed a replace may hold more. */
const REQUESTS_READ = 20

/** Whether a request can still be answered: unanswered, and its run is still the newest of its session. */
export async function requestIsCurrent(siteId: string, run: RunRow): Promise<boolean> {
  if (run.manifestStatus === 'SUPERSEDED') return false
  const [newest] = await siteRuntimeStore.listRuns(siteId, { sessionId: run.sessionId, limit: 1 })
  return !newest || newest.id === run.id
}

/** Best effort: a site that cannot be reached leaves its request pending there, and hq's lists read only the newest run. */
export async function replaceRequestOnSite(siteId: string, runId: string): Promise<void> {
  try {
    await siteRuntimeStore.replaceRequest(siteId, runId)
  } catch (err) {
    logger.error(`could not mark request ${runId} replaced on site ${siteId}`, err)
  }
}

/**
 * A person dismissed the task's run or ran it again: its unanswered request is replaced on the site and leaves
 * every list. Best effort: a failure is logged and never undoes what the person did.
 */
export async function replaceTaskRequests(taskId: string): Promise<void> {
  try {
    const session = await prisma.agentSession.findUnique({ where: { taskId } })
    if (session) {
      const siteId = await dispatchService.resolveSiteIdForSession(session)
      const runs = await siteRuntimeStore.listRuns(siteId, { sessionId: session.id, limit: REQUESTS_READ })
      for (const run of runs.filter(r => r.manifestStatus === 'PENDING_APPROVAL')) {
        await replaceRequestOnSite(siteId, run.id)
      }
    }
  } catch (err) {
    logger.error(`could not replace the unanswered requests of task ${taskId}`, err)
  }
  await markTaskNotificationsHandled(taskId)
}

/**
 * A message into a task's session replaced the task's request: the site replaced it as that run started. A task
 * that was waiting only for that approval waits no more.
 */
export async function releaseTaskFromReplacedRequest(taskId: string): Promise<void> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, runState: 'RUN_BLOCKED', runStateReason: { startsWith: MANIFEST_BLOCKED_REASON } },
    data: { runState: 'RUN_NONE', runStateReason: null },
  })
  if (count === 0) return
  await notifyBoardsOfTasks([taskId])
  await markTaskNotificationsHandled(taskId)
}
