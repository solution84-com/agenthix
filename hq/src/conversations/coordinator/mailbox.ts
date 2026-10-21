/**
 * Where the work's events land (conversation layer spec, Detaching, step by step; A completion while a reply
 * streams; Lifecycle contracts, Conversation). An ended operation becomes a RESULT card, once; a request for
 * approval an APPROVAL_REQUEST card, once per operation and run, its words plain and its reason one line. A RESULT
 * card awaits a turn — the next report or continuation turn after any waiting messages takes every one — unless
 * the person stopped the work (noReport) or the conversation is closed. A request takes no turn (the agent says
 * nothing when one arrives): its reader is told its own line, and answers it on the card. Either wakes an archived
 * conversation. A closed one runs no turn: its reader is told the result's own line instead, and nobody is asked
 * there. Each call tells the screens the operation's new state and the count.
 */
import { prisma } from 'wasp/server'
import type { LedgerKeeper, Mailbox } from '../contract'
import { openJson, openText } from '../sealing'
import { appendMessageIn } from '../store/messages'
import { Logger } from '../../server/utils/logger'
import { createSettleOperation, outstandingOperations } from '../work/settle'
import {
  ENDED_OPERATION_STATES,
  type ApprovalRequestBody,
  type ConversationMessageView,
  type OperationResult,
  type OperationStateValue,
  type ResultBody,
} from '../../shared/conversations/protocol'
import { conversationEvents, type ConversationEvents } from './events'
import { approvalLine, cardLine, resultBodyOf, resultLine, type EndedState } from './cards'
import { plainText } from '../plainText'
import { boundaryName } from './continuationChecks'
import { notifyCard, type CardNotice } from './notify'
import { scheduleConversation } from './scheduler'
import { ledger } from '../long/ledger'

const logger = new Logger('ConversationMailbox')

function ended(state: OperationStateValue): state is EndedState {
  return (ENDED_OPERATION_STATES as readonly string[]).includes(state)
}

export interface MailboxDeps {
  schedule(conversationId: string): void
  notify(notice: CardNotice): Promise<void>
  events: ConversationEvents
  /** The ledger (long/): an ended operation's entry trimmed to its one line. */
  ledger?: Pick<LedgerKeeper, 'closeOperation'>
}

type CardInput =
  | { kind: 'RESULT'; body: ResultBody }
  | { kind: 'APPROVAL_REQUEST'; body: ApprovalRequestBody }

interface WrittenCard {
  message: ConversationMessageView
  duplicate: boolean
  /** Awaiting a turn now: written so, and no turn has taken it yet. */
  awaitsTurn: boolean
  closed: boolean
}

/**
 * Writes the card under the conversation's row lock, with `key` as its message key so a repeat stores nothing,
 * and in the same transaction marks a result awaiting a turn and wakes an archived conversation.
 */
async function writeCard(conversationId: string, operationId: string, key: string, card: CardInput, noReport: boolean): Promise<WrittenCard> {
  return prisma.$transaction(async (tx) => {
    const { message, duplicate } = await appendMessageIn(tx, {
      conversationId, role: 'PLATFORM', kind: card.kind, body: card.body, operationId, clientMessageId: key,
    })
    const { status } = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { status: true } })
    const closed = status === 'CLOSED'
    if (duplicate) {
      const stored = await tx.conversationMessage.findUniqueOrThrow({ where: { id: message.id }, select: { awaitsTurn: true, turnId: true } })
      return { message, duplicate, awaitsTurn: stored.awaitsTurn && stored.turnId === null, closed }
    }
    const wakes = !closed && !noReport
    const awaitsTurn = wakes && card.kind === 'RESULT'
    if (awaitsTurn) await tx.conversationMessage.update({ where: { id: message.id }, data: { awaitsTurn: true } })
    if (wakes && status === 'ARCHIVED') await tx.conversation.update({ where: { id: conversationId }, data: { status: 'ACTIVE', archivedAt: null } })
    return { message, duplicate, awaitsTurn, closed }
  })
}

async function taskOf(taskId: string | null): Promise<{ id: string; key: string; agentName: string | null } | null> {
  if (!taskId) return null
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { number: true, project: { select: { key: true } }, assignedAgent: { select: { name: true } } },
  })
  return task ? { id: taskId, key: `${task.project.key}-${task.number}`, agentName: task.assignedAgent?.name ?? null } : null
}

async function readOperation(operationId: string) {
  const row = await prisma.operation.findUnique({
    where: { id: operationId },
    select: {
      id: true, conversationId: true, kind: true, state: true, title: true, resultSummary: true, error: true, noReport: true,
      boundaryType: true, boundaryId: true, taskId: true, conversation: { select: { agent: { select: { name: true } } } },
    },
  })
  if (!row) return null
  return {
    ...row,
    title: openText(row.title),
    result: row.resultSummary ? openJson<OperationResult>(row.resultSummary) : null,
    boundaryName: row.boundaryType && row.boundaryId ? await boundaryName(row.boundaryType, row.boundaryId) : undefined,
  }
}

export function createMailbox(deps: MailboxDeps): Mailbox {
  async function announce(conversationId: string, operationId: string, state: OperationStateValue, title: string): Promise<void> {
    const outstanding = await outstandingOperations(conversationId)
    deps.events.operation({ conversationId, operationId, state, title, outstanding })
  }

  async function deliver(conversationId: string, written: WrittenCard, line: string | null): Promise<void> {
    // A repeat delivers again what the first may have stopped short of: scheduling and notifying are both safe twice.
    if (!written.duplicate) deps.events.message(conversationId, written.message)
    if (written.awaitsTurn) deps.schedule(conversationId)
    else if (written.closed && line) {
      await deps.notify({ conversationId, card: written.message as CardNotice['card'], line, approval: false })
    }
  }

  const mailbox: Mailbox = {
    operationSettled(_conversationId, operationId) {
      void mailbox.operationEnded(operationId).catch(err => logger.error(`Could not deliver the end of operation ${operationId}`, err))
    },

    async operationEnded(operationId) {
      const op = await readOperation(operationId)
      if (!op) return
      await announce(op.conversationId, op.id, op.state, op.title)
      if (!ended(op.state)) return
      const task = await taskOf(op.taskId)
      const body = resultBodyOf({
        title: op.title, state: op.state, result: op.result, error: op.error, boundaryName: op.boundaryName, task,
      })
      const written = await writeCard(op.conversationId, op.id, `result:${op.id}`, { kind: 'RESULT', body }, op.noReport)
      if (!written.duplicate) {
        await deps.ledger?.closeOperation(op.conversationId, op.id, resultLine(body))
          .catch(err => logger.error(`Could not close operation ${op.id} in the ledger`, err))
      }
      // A stopped or detached piece of work tells no one: the person stopped it, or the conversation is going.
      const line = op.noReport || op.state === 'DETACHED' ? null : resultLine(body)
      await deliver(op.conversationId, written, line)
    },

    async approvalRequested(operationId, request) {
      const op = await readOperation(operationId)
      if (!op) return
      const task = op.kind === 'TASK' ? await taskOf(op.taskId) : null
      const what = request.what ? plainText(request.what) : ''
      const body: ApprovalRequestBody = {
        title: op.title,
        reason: cardLine(request.reason) || what || op.title,
        askedBy: task?.agentName ?? op.conversation.agent?.name ?? 'The agent',
        ...(what ? { what } : {}),
        ...(op.boundaryName ? { boundaryName: op.boundaryName } : {}),
      }
      const written = await writeCard(op.conversationId, op.id, `approval:${op.id}:${request.runId}`, { kind: 'APPROVAL_REQUEST', body }, false)
      await announce(op.conversationId, op.id, op.state, op.title)
      if (!written.duplicate) deps.events.message(op.conversationId, written.message)
      // A closed conversation declines what waits in it (its owner's to do): nobody is asked there. A repeat
      // notifies again what the first may have stopped short of; the reader is told once.
      if (!written.closed) await deps.notify({ conversationId: op.conversationId, card: written.message as CardNotice['card'], line: approvalLine(body), approval: true })
    },
  }
  return mailbox
}

export const mailbox: Mailbox = createMailbox({
  schedule: conversationId => scheduleConversation(conversationId),
  notify: notifyCard,
  events: conversationEvents,
  ledger,
})

export const settleOperation = createSettleOperation(() => mailbox)
