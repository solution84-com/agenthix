/**
 * An agent's ask to merge its branch into `main` (live preview spec, *Merge into main*, *Who may merge*): its
 * `merge_into_main` tool merges nothing. It puts a confirmation in the branch's conversation or task thread —
 * *Kernel will merge add-login-page into main as one version* · *Merge* · *Not now* — written as every approval card
 * is (`assets/approvals/request.ts`, `workflows/review/card.ts`): an operation of the conversation waiting for
 * approval, holding what was asked sealed, and an `APPROVAL_REQUEST` message. The merge happens when a person who may
 * merge presses *Merge* (`mergeCardAnswer.ts`), onto the `main` the card was made against.
 *
 * At most one card waits per branch: an agent that asks again is told the person already has one.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { BRANCH_READ_METHODS, type ApprovalRequestBody, type MergeToolResult } from '@agenthix/core'
import { appendMessage } from '../conversations/store/messages'
import { conversationEvents } from '../conversations/coordinator/events'
import { boundaryName } from '../conversations/coordinator/continuationChecks'
import { approvalLine } from '../conversations/coordinator/cards'
import { notifyCard, type CardNotice } from '../conversations/coordinator/notify'
import { outstandingOperations } from '../conversations/work/settle'
import { sealJson, sealText } from '../conversations/sealing'
import { lockWork, mergeBaseOf, refOfBranch, workOfBranch, type BranchWithCopies, type WorkOf } from './branchRows'
import { siteCall } from './siteCalls'
import { MERGE_CARD_TOOL, mergeCardKeyPrefix, type MergeCardArgs } from './mergeCardArgs'

export type MergeAskInput = {
  branch: BranchWithCopies
  logicalSiteId: string
  agentId: string
  /** The person the work is for: the card's asker of record. */
  personId: string
  message: string
}

/** Why there is nobody to ask, in words for the agent; the caller refuses with it. */
export class NoOneToAsk extends Error {}

const NOTHING = 'Nothing was merged.'

/** The conversation the card goes in: the branch's own, or its task's thread, started now when it has none. */
export async function cardConversation(work: WorkOf, personId: string): Promise<string> {
  if ('conversationId' in work) {
    const c = await prisma.conversation.findUnique({ where: { id: work.conversationId }, select: { status: true } })
    if (!c || c.status === 'CLOSED') throw new NoOneToAsk(`This work's conversation is closed, so there is nobody to ask. ${NOTHING}`)
    return work.conversationId
  }
  const existing = await prisma.conversation.findUnique({ where: { taskId: work.taskId }, select: { id: true, status: true } })
  if (existing) {
    if (existing.status === 'CLOSED') throw new NoOneToAsk(`This task's thread is closed, so there is nobody to ask. ${NOTHING}`)
    return existing.id
  }
  const task = await prisma.task.findUnique({ where: { id: work.taskId }, select: { projectId: true } })
  if (!task) throw new NoOneToAsk(`This task is gone. ${NOTHING}`)
  try {
    const made = await prisma.conversation.create({
      data: { home: 'TASK', taskId: work.taskId, projectId: task.projectId, openedById: personId, agentId: null },
      select: { id: true },
    })
    return made.id
  } catch (err) {
    // Someone started the thread meanwhile: the card goes in theirs.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.conversation.findUnique({ where: { taskId: work.taskId }, select: { id: true } })
      if (winner) return winner.id
    }
    throw err
  }
}

function askedNote(already: boolean, branch: string, main: string): string {
  return already
    ? `The person already has a confirmation waiting to merge ${branch} into ${main}. Nothing was merged yet: tell them it is waiting for them, and do not ask again.`
    : `The person was asked to confirm merging ${branch} into ${main}. Nothing was merged yet: it is merged only when they press Merge. Tell them the confirmation is waiting for them.`
}

export async function askToMerge(input: MergeAskInput): Promise<MergeToolResult> {
  const b = input.branch
  const work = workOfBranch(b)
  if (!work) throw new NoOneToAsk(`This branch is no work's, so there is nobody to ask. ${NOTHING}`)
  const base = mergeBaseOf(b)
  const list = await siteCall(input.logicalSiteId, BRANCH_READ_METHODS.list, {
    workspace: refOfBranch(b), merged: base ? [{ branch: b.name, base }] : [],
  })
  const main = list.main.name
  const conversationId = await cardConversation(work, input.personId)
  const agent = await prisma.agent.findUnique({ where: { id: input.agentId }, select: { name: true } })
  const agentName = agent?.name ?? 'The agent'
  const args: MergeCardArgs = {
    branchId: b.id, workspaceId: b.workspaceId, branch: b.name, main, expectedMain: list.main.head,
    message: input.message, agentId: input.agentId, agentName,
  }
  const title = `Merge ${b.name} into ${main}`

  const made = await prisma.$transaction(async (tx) => {
    await lockWork(tx, work)
    const waiting = await tx.operation.findFirst({
      where: { conversationId, toolName: MERGE_CARD_TOOL, state: 'WAITING_FOR_APPROVAL', idempotencyKey: { startsWith: mergeCardKeyPrefix(b.id) } },
      select: { id: true },
    })
    if (waiting) return null
    return tx.operation.create({
      data: {
        conversationId, kind: 'TOOL', mode: 'BACKGROUND', toolName: MERGE_CARD_TOOL,
        idempotencyKey: `${mergeCardKeyPrefix(b.id)}${randomUUID()}`,
        state: 'WAITING_FOR_APPROVAL', title: sealText(title),
        args: sealJson(args as unknown as Record<string, unknown>),
        authorisedById: input.personId, boundaryType: b.ownerType, boundaryId: b.ownerId,
      },
      select: { id: true },
    })
  })
  if (!made) return { asked: true, branch: b.name, main, alreadyAsked: true, note: askedNote(true, b.name, main) }

  const body: ApprovalRequestBody = {
    title,
    reason: `Summary: ${input.message}`,
    askedBy: agentName,
    what: `${agentName} will merge ${b.name} into ${main} as one version`,
    boundaryName: await boundaryName(b.ownerType, b.ownerId),
  }
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body, operationId: made.id, clientMessageId: `approval:${made.id}:merge`,
  })
  conversationEvents.message(conversationId, message)
  conversationEvents.operation({
    conversationId, operationId: made.id, state: 'WAITING_FOR_APPROVAL', title, outstanding: await outstandingOperations(conversationId),
  })
  await notifyCard({ conversationId, card: message as CardNotice['card'], line: approvalLine(body), approval: true })
  return { asked: true, branch: b.name, main, alreadyAsked: false, note: askedNote(false, b.name, main) }
}
