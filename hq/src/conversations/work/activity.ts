/**
 * The work bar and *View results* (conversation layer spec, Conversation activity): a conversation's live
 * operations — with a waiting one's request for the person's okay and where the run opens — and what an ended
 * operation gave and the work of the run behind it, fetched from its site when asked for. Ended work is in the
 * thread as its card, not here. Reading is for anyone who may read the conversation; Stop is shown
 * to those who may speak in it.
 */
import { HttpError, prisma } from 'wasp/server'
import { workLine, type TranscriptRow } from '@agenthix/core'
import {
  OUTSTANDING_OPERATION_STATES,
  type ConversationActivity,
  type GetConversationActivityArgs,
  type GetOperationResultArgs,
  type OperationResult,
  type OperationResultView,
} from '../../shared/conversations/protocol'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { boundaryName } from '../coordinator/continuationChecks'
import { readConversationAs, requireConversationReader } from '../readingRule'
import { openJson, openText } from '../sealing'
import { liveActivityOf } from '../../sites/channel/operationLinesForward'
import { toMessageView } from '../store/messages'
import { orderActivity, runHrefOf, taskWaitingLine, toActivityView, type ActivityRow } from './activityLines'
import { contextUseByOperation } from './activityContext'
import { mayAdministerPlace, type WorkflowPlace } from '../../workflows/placeAccess'
import { usedSkillSteps } from '../../assets/conversation/usedSkillView'
import { noteSkillUses, type RunPlace } from '../../assets/conversation/lastUsed'
import { isProjectMember } from '../../projects/membership'

type Ctx = { user?: { id: string } | null }

/** The most transcript rows read to draw one run's work. */
const TRANSCRIPT_TAIL = 1_000

function requireUser(context: Ctx): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

/** Whether a row belongs in the sheet: a foreground call that returned within the wait limit never counted. */
const showsInSheet = { OR: [{ mode: 'BACKGROUND' as const }, { promoted: true }, { kind: { not: 'TOOL' as const } }] }

type TaskFacts = { key: string; agentName: string; sessionId: string | null }

async function taskFactsOf(taskIds: string[]): Promise<Map<string, TaskFacts>> {
  if (taskIds.length === 0) return new Map()
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: {
      id: true, number: true, project: { select: { key: true } }, assignedAgent: { select: { name: true } },
      session: { select: { id: true } },
    },
  })
  return new Map(tasks.map((t) => [t.id, {
    key: `${t.project.key}-${t.number}`, agentName: t.assignedAgent?.name ?? 'the agent', sessionId: t.session?.id ?? null,
  }]))
}

type Request = NonNullable<ActivityRow['request']> & { workflowCard?: ActivityRow['workflowCard'] }

function requestFields(r: Request | undefined): Pick<ActivityRow, 'request' | 'workflowCard'> {
  if (!r) return { request: null }
  const { workflowCard, ...request } = r
  return { request, ...(workflowCard ? { workflowCard } : {}) }
}

async function workflowPlace(workflowId: string): Promise<WorkflowPlace | null> {
  const w = await prisma.workflow.findUnique({ where: { id: workflowId }, select: { placeType: true, placeId: true } })
  return w ? { type: w.placeType, id: w.placeId } : null
}

/** Each waiting operation's latest request for the person's okay, from its card: what would run and why. */
async function requestsOf(conversationId: string, operationIds: string[], viewerId: string): Promise<Map<string, Request>> {
  if (operationIds.length === 0) return new Map()
  const cards = await prisma.conversationMessage.findMany({
    where: { conversationId, kind: 'APPROVAL_REQUEST', operationId: { in: operationIds } },
    orderBy: { seq: 'asc' },
  })
  const requests = new Map<string, Request>()
  for (const card of cards.map(toMessageView)) {
    if (card.kind !== 'APPROVAL_REQUEST' || !card.operationId) continue
    const { what, title, reason, askedBy, workflow } = card.body
    // A workflow's card: its buttons are for the place's administrators only.
    const place = workflow ? await workflowPlace(workflow.workflowId) : null
    const extra = workflow ? { workflowCard: { ...workflow, canAnswer: place ? await mayAdministerPlace(place, viewerId) : false } } : {}
    requests.set(card.operationId, { what: what || title, reason, askedBy, ...extra })
  }
  return requests
}

export const getConversationActivity = async (args: GetConversationActivityArgs, context: Ctx): Promise<ConversationActivity> => {
  const userId = requireUser(context)
  const { ref, speakingRefusal } = await readConversationAs(args?.conversationId, userId)

  const outstanding = await prisma.operation.findMany({
    where: { conversationId: ref.id, state: { in: [...OUTSTANDING_OPERATION_STATES] }, ...showsInSheet },
    orderBy: { createdAt: 'desc' },
  })
  const rows = outstanding
  const [tasks, contextUse, requests] = await Promise.all([
    taskFactsOf(rows.flatMap((r) => (r.kind === 'TASK' && r.taskId ? [r.taskId] : []))),
    contextUseByOperation(rows),
    requestsOf(ref.id, outstanding.filter((r) => r.state === 'WAITING_FOR_APPROVAL').map((r) => r.id), userId),
  ])
  const boundaries = new Map<string, string>()
  const boundaryOf = async (type: 'user' | 'project' | null, id: string | null): Promise<string | null> => {
    if (!type || !id) return null
    const held = boundaries.get(`${type}:${id}`)
    if (held) return held
    const name = await boundaryName(type, id)
    boundaries.set(`${type}:${id}`, name)
    return name
  }

  const views: ActivityRow[] = []
  for (const row of rows) {
    const boundary = await boundaryOf(row.boundaryType, row.boundaryId)
    const live = liveActivityOf(row.id)
    const task = row.kind === 'TASK' && row.taskId ? tasks.get(row.taskId) : undefined
    // A task not yet running reads where it waits; one running reads its helpers, as a worker's brief does.
    const waiting = task && live.lines.length === 0 ? taskWaitingLine(row.state, boundary, task.agentName, task.key) : null
    views.push({
      id: row.id,
      kind: row.kind,
      state: row.state,
      title: openText(row.title),
      boundaryName: boundary,
      lines: waiting ? [waiting] : live.lines,
      endedHelpers: live.endedHelpers,
      contextUse: contextUse.get(row.id) ?? null,
      createdAt: row.createdAt,
      ...requestFields(requests.get(row.id)),
      runHref: runHrefOf({ runId: row.runId, sessionId: task ? task.sessionId : row.workerSessionId }, ref.id),
    })
  }
  const canStop = speakingRefusal === null
  return { outstanding: outstanding.length, operations: orderActivity(views).map((v) => toActivityView(v, canStop)) }
}

const SITE_PROBLEM = "The place this ran is not reachable now, so its work can't be shown. The result above is kept."

/** The run's work as the run screen draws it, from its site; null with a plain problem line when it cannot be read. */
async function runWork(siteId: string, runId: string, viewerId: string, place: RunPlace): Promise<Pick<OperationResultView, 'work' | 'problem' | 'runUrl'>> {
  try {
    const run = await siteRuntimeStore.getRun(siteId, runId)
    if (!run) return { work: null, problem: 'This run is no longer on its site, so its work cannot be shown.', runUrl: null }
    await noteSkillUses(prisma, [run], place)
    const rows = await siteRuntimeStore.listTranscript(siteId, run.sessionId, { limit: TRANSCRIPT_TAIL, tail: true })
    const mine = rows.filter((r) => r.runId === runId)
    const line = workLine(mine as TranscriptRow[], { startedAt: run.startedAt, endedAt: run.endedAt })
    return {
      work: { steps: await usedSkillSteps({ db: prisma, sees: isProjectMember }, viewerId, line.steps, run.skillsUsed), summary: line.summary },
      problem: null,
      runUrl: `/runs/${runId}?session=${run.sessionId}`,
    }
  } catch (err) {
    if (err instanceof SiteUnreachableError) return { work: null, problem: SITE_PROBLEM, runUrl: null }
    throw err
  }
}

export const getOperationResult = async (args: GetOperationResultArgs, context: Ctx): Promise<OperationResultView> => {
  const userId = requireUser(context)
  const ref = await requireConversationReader(args?.conversationId, userId)
  const row = await prisma.operation.findFirst({ where: { id: args.operationId, conversationId: ref.id } })
  if (!row) throw new HttpError(404, 'That work is not in this conversation')

  const result = row.resultSummary ? openJson<OperationResult>(row.resultSummary) : null
  const runId = result?.runId ?? row.runId
  const detail = row.siteId && runId ? await runWork(row.siteId, runId, userId, row.boundaryType && row.boundaryId ? { placeType: row.boundaryType, placeId: row.boundaryId } : null) : { work: null, problem: null, runUrl: null }
  return {
    title: openText(row.title),
    state: row.state,
    summary: result?.summary ?? row.error ?? null,
    stated: result ? result.stated ?? null : null,
    ...detail,
  }
}
