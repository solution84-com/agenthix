/**
 * Deleting a conversation (conversation layer spec, Failure, recovery; on-screen spec, Deleting is permanent):
 * permanent, confirmed once, naming what goes and what stays. Only its opener deletes a personal or project
 * conversation; a task's thread, the team's, only an admin of its task's project — which removes its messages and
 * never the task's runs.
 *
 * Its worker operations are stopped — the runs are the conversation's — and its standing workers' sessions are
 * ended on their sites as a deleted chat's are today, site first, so a site that cannot be reached refuses the
 * delete and leaves everything as it was. Its task operations are detached: a task is the project's and carries
 * on, its result going to the task alone. Then the conversation goes, with its messages and operations.
 */
import { HttpError, prisma } from 'wasp/server'
import { OUTSTANDING_OPERATION_STATES, type ConversationDeletePreview, type DeleteConversationArgs } from '../../shared/conversations/protocol'
import * as dispatchService from '../../agents/dispatchService'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import { expirePreviewsForSession } from '../../preview/previewRegistry'
import { rethrowSiteUnreachableAsHttp } from '../../storage/httpErrors'
import { requireConversationReader } from '../readingRule'
import { openJson, openText } from '../sealing'
import { boundaryName } from '../coordinator/continuationChecks'
import { stopRunningTurn } from '../coordinator/scheduler'
import { operationOwner } from './registry'
import { projectRole } from '../../projects/membership'

type Ctx = { user?: { id: string } | null }

export const TASK_THREAD_ADMINS = "A task's conversation is deleted or archived only by one of its project's admins"

/** An admin of the project; a personal project's own person. */
async function administers(projectId: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } })
  if (project?.personalOwnerId) return project.personalOwnerId === userId
  return (await projectRole(projectId, userId)) === 'ADMIN'
}

/**
 * The conversation, when this person may delete it: its opener, who alone reads a personal or project one; for a
 * task's thread, an admin of its project.
 */
async function deletable(args: DeleteConversationArgs, context: Ctx) {
  if (!context.user) throw new HttpError(401)
  const ref = await requireConversationReader(args?.conversationId, context.user.id)
  if (ref.home === 'TASK' && !(ref.projectId && (await administers(ref.projectId, context.user.id)))) {
    throw new HttpError(403, TASK_THREAD_ADMINS)
  }
  return { ref, userId: context.user.id }
}

async function outstanding(conversationId: string) {
  return prisma.operation.findMany({
    where: { conversationId, state: { in: [...OUTSTANDING_OPERATION_STATES] } },
    select: { id: true, kind: true, title: true, boundaryType: true, boundaryId: true },
    orderBy: { createdAt: 'asc' },
  })
}

/** The tasks the conversation asked for or created: they are the project's and stay. */
async function tasksOf(conversationId: string): Promise<string[]> {
  const rows = await prisma.operation.findMany({
    where: { conversationId, OR: [{ kind: 'TASK' }, { kind: 'TOOL', toolName: 'create_task', state: 'COMPLETED' }] },
    select: { kind: true, taskId: true, resultSummary: true },
    orderBy: { createdAt: 'asc' },
  })
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.taskId) ids.add(row.taskId)
    else if (row.resultSummary) {
      const created = openJson<{ taskId?: unknown }>(row.resultSummary)
      if (typeof created?.taskId === 'string') ids.add(created.taskId)
    }
  }
  if (ids.size === 0) return []
  const tasks = await prisma.task.findMany({
    where: { id: { in: [...ids] } },
    select: { number: true, title: true, project: { select: { key: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return tasks.map(t => `${t.project.key}-${t.number} ${t.title}`)
}

export const getConversationDeletePreview = async (args: DeleteConversationArgs, context: Ctx): Promise<ConversationDeletePreview> => {
  const { ref } = await deletable(args, context)
  const stops: string[] = []
  for (const op of await outstanding(ref.id)) {
    if (op.kind === 'TASK') continue
    const title = openText(op.title)
    stops.push(op.boundaryType && op.boundaryId ? `${title} · ${await boundaryName(op.boundaryType, op.boundaryId)}` : title)
  }
  const { status } = await prisma.conversation.findUniqueOrThrow({ where: { id: ref.id }, select: { status: true } })
  const [messages, runs] = await Promise.all([
    prisma.conversationMessage.count({ where: { conversationId: ref.id } }),
    prisma.operation.count({ where: { conversationId: ref.id, kind: 'WORKER', runId: { not: null } } }),
  ])
  return { stops, leaves: await tasksOf(ref.id), canArchive: status === 'ACTIVE', messages, runs }
}

/** A standing worker's session, ended on its site as a deleted chat's is: its runs stopped, then the session, then hq's copy. */
async function endWorkerSession(session: Parameters<typeof dispatchService.resolveSiteIdForSession>[0] & { id: string }): Promise<void> {
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    for (const run of await siteRuntimeStore.listRuns(siteId, { sessionId: session.id, activeOnly: true })) {
      await siteRuntimeStore.cancelRun(siteId, run.id)
    }
    await siteRuntimeStore.deleteSession(siteId, session.id)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  await expirePreviewsForSession(session.id)
  await prisma.agentSession.delete({ where: { id: session.id } })
}

export const deleteConversation = async (args: DeleteConversationArgs, context: Ctx): Promise<void> => {
  const { ref, userId } = await deletable(args, context)
  // The reply being written stops first, so nothing new is started while the rest goes.
  await stopRunningTurn(ref.id, 'stop')
  try {
    for (const op of await outstanding(ref.id)) await operationOwner(op.kind).cancel(op.id, userId)
    const workers = await prisma.agentSession.findMany({ where: { conversationId: ref.id } })
    for (const session of workers) await endWorkerSession(session)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { conversationId: ref.id } }),
    prisma.conversation.delete({ where: { id: ref.id } }),
  ])
}

/**
 * Archiving instead, the confirm's cheap way out: hidden from the list and kept, its work going on; reopened, or
 * woken by a completion, it is active again.
 */
export const archiveConversation = async (args: DeleteConversationArgs, context: Ctx): Promise<void> => {
  const { ref } = await deletable(args, context)
  const { count } = await prisma.conversation.updateMany({ where: { id: ref.id, status: 'ACTIVE' }, data: { status: 'ARCHIVED', archivedAt: new Date() } })
  if (count === 0) throw new HttpError(409, 'Only an open conversation can be archived')
}
