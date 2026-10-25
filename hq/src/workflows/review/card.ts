/**
 * The approval card in the conversation a proposal came from (workflows spec part 5, *Approving a version (U4)*):
 * a waiting request — an operation of the conversation, with an `APPROVAL_REQUEST` card — that carries the plain
 * checks' summary and flags, the reviewer's level, and whether Approve may be offered. The operation holds the
 * version's workflow and hash, so an answer to the card can approve only the version it showed (`cardAnswer.ts`).
 *
 * A proposal made by a run no conversation started (a scheduled task's) has no card; it is approved from the
 * workflow's page.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { ApprovalRequestBody, WorkflowApprovalCard, WorkflowCheckFlag } from '@agenthix/core'
import { appendMessage } from '../../conversations/store/messages'
import { conversationEvents } from '../../conversations/coordinator/events'
import { boundaryName } from '../../conversations/coordinator/continuationChecks'
import { approvalLine } from '../../conversations/coordinator/cards'
import { notifyCard, type CardNotice } from '../../conversations/coordinator/notify'
import { outstandingOperations } from '../../conversations/work/settle'
import { sealJson, sealText } from '../../conversations/sealing'
import type { StoredReview } from './types'
import { WORKFLOW_APPROVAL_TOOL, type WorkflowCardArgs } from './cardTool'


const LEVEL_WORD = { LOW: 'low', LOOK_CLOSELY: 'look_closely', HIGH: 'high' } as const

export type CardVersion = {
  id: string
  number: number
  hash: string
  workflowId: string
  workflowName: string
  checkFlags: Prisma.JsonValue
  checkSummary: string | null
  cardMayApprove: boolean | null
  reviewLevel: keyof typeof LEVEL_WORD | null
  reviewPoints: Prisma.JsonValue
}

/** The card's workflow part, from the stored version: everything on it is the plain checks', bar the level. */
export function workflowCard(v: CardVersion, reason: string | null): WorkflowApprovalCard {
  const flags = (Array.isArray(v.checkFlags) ? v.checkFlags : []) as unknown as WorkflowCheckFlag[]
  const review = (v.reviewPoints ?? null) as StoredReview | null
  const mayApprove = v.cardMayApprove === true
  return {
    workflowId: v.workflowId,
    workflow: v.workflowName,
    version: v.number,
    hash: v.hash,
    summary: v.checkSummary ?? `Version ${v.number} of ${v.workflowName}.`,
    reviewLevel: v.reviewLevel ? LEVEL_WORD[v.reviewLevel] : null,
    ...(review?.note ? { reviewNote: review.note } : {}),
    flags: flags.map((f) => ({ rule: f.rule, high: f.high, message: f.message, ...(f.path ? { path: f.path } : {}), ...(f.line ? { line: f.line } : {}) })),
    mayApprove,
    ...(mayApprove ? {} : { reason: reason ?? 'The plain checks ask for the full review.' }),
  }
}

/** The conversation whose work proposed it: the operation that runs the proposing agent's run. */
async function conversationOf(runId: string) {
  const op = await prisma.operation.findFirst({
    where: { runId },
    orderBy: { createdAt: 'desc' },
    select: { conversationId: true, conversation: { select: { status: true, agent: { select: { name: true } } } } },
  })
  return op && op.conversation.status !== 'CLOSED' ? op : null
}

export type CardTarget = {
  version: CardVersion
  place: { type: 'user' | 'project'; id: string }
  proposedByRunId: string | null
  proposedForUserId: string | null
  agentName: string | null
  /** Why only Review all of it, when the card may not offer Approve. */
  reason: string | null
}

/** Writes the card once per version; answers whether one was written. */
export async function writeWorkflowCard(t: CardTarget): Promise<boolean> {
  if (!t.proposedByRunId || !t.proposedForUserId) return false
  const at = await conversationOf(t.proposedByRunId)
  if (!at) return false
  const { conversationId } = at
  const v = t.version
  const title = `Approve version ${v.number} of ${v.workflowName}`
  const args: WorkflowCardArgs = { workflowId: v.workflowId, versionId: v.id, hash: v.hash }
  let operationId: string
  try {
    const row = await prisma.operation.create({
      data: {
        conversationId,
        kind: 'TOOL',
        mode: 'BACKGROUND',
        toolName: WORKFLOW_APPROVAL_TOOL,
        idempotencyKey: `workflow-approval:${v.id}`,
        state: 'WAITING_FOR_APPROVAL',
        title: sealText(title),
        args: sealJson(args),
        authorisedById: t.proposedForUserId,
        boundaryType: t.place.type,
        boundaryId: t.place.id,
      },
      select: { id: true },
    })
    operationId = row.id
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
    throw err
  }
  const card = workflowCard(v, t.reason)
  const body: ApprovalRequestBody = {
    title,
    reason: card.summary,
    askedBy: t.agentName ?? at.conversation.agent?.name ?? 'The agent',
    what: `approve version ${v.number} of the workflow ${v.workflowName}`,
    boundaryName: await boundaryName(t.place.type, t.place.id),
    workflow: card,
  }
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body, operationId, clientMessageId: `approval:${operationId}:workflow`,
  })
  conversationEvents.message(conversationId, message)
  conversationEvents.operation({
    conversationId, operationId, state: 'WAITING_FOR_APPROVAL', title, outstanding: await outstandingOperations(conversationId),
  })
  await notifyCard({ conversationId, card: message as CardNotice['card'], line: approvalLine(body), approval: true })
  return true
}
