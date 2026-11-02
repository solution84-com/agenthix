/**
 * The owner of TOOL operations, the lead's own calls (conversation layer spec, Approval; Conversation activity,
 * Stopping). The caller has already checked that the person may.
 *
 * Approve: the call runs now, as it was asked, as the person who answered, detached like any detached call — its
 * end comes back through the mailbox as a completion with its report turn. Decline: it ends cancelled with no
 * report turn, since the lead takes its turn on the answer itself. Stop: a waiting call ends; a running one's
 * result is abandoned — the request in flight is not called back, and its end, when it comes, changes nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import { OUTSTANDING_OPERATION_STATES } from '../../../shared/conversations/protocol'
import type { OperationEnd, OperationOwner, SettleOperation } from '../../contract'
import { settleOperation } from '../../coordinator/mailbox'
import { openJson } from '../../sealing'
import { Logger } from '../../../server/utils/logger'
import { runApprovedCall, type ApprovedCall } from './runApproved'
import { answerWorkflowCard, isWorkflowCard } from '../../../workflows/review/cardAnswer'
import { answerAssetCard, isAssetCard } from '../../../assets/approvals/answer'
import { isMergeCard } from '../../../branches/mergeCardArgs'
import { answerMergeCard } from '../../../branches/mergeCardAnswer'

export const NOT_WAITING = 'This request is not waiting for an answer.'

export interface ToolCallRow {
  id: string
  kind: string
  state: string
  conversationId: string
  turnId: string | null
  toolName: string
  args: Record<string, unknown> | null
}

export interface ToolCallOwnerDeps {
  read(operationId: string): Promise<ToolCallRow | null>
  /** Waiting → running, once: false when someone answered first. */
  start(operationId: string): Promise<boolean>
  settle: SettleOperation
  run(call: ApprovedCall, answererId: string): Promise<OperationEnd>
  /** Where the approved call goes on: not waited for by the answer. */
  detach(work: Promise<void>): void
  logError(message: string, err: unknown): void
}

function declinedLine(note: string | null): string {
  return note?.trim() ? `Declined: ${note.trim()}` : 'Declined.'
}

export function createToolCallOwner(deps: ToolCallOwnerDeps): OperationOwner {
  async function toolCall(operationId: string): Promise<ToolCallRow> {
    const row = await deps.read(operationId)
    if (!row || row.kind !== 'TOOL') throw new HttpError(404, 'That request was not found')
    return row
  }

  return {
    async cancel(operationId) {
      const row = await toolCall(operationId)
      if (!(OUTSTANDING_OPERATION_STATES as readonly string[]).includes(row.state)) return
      await deps.settle(operationId, { state: 'CANCELLED', noReport: true })
    },

    async answerApproval(operationId, answer, note, byUserId) {
      const row = await toolCall(operationId)
      if (row.state !== 'WAITING_FOR_APPROVAL') throw new HttpError(409, NOT_WAITING)
      if (isWorkflowCard(row.toolName)) return answerWorkflowCard(row, answer, byUserId, deps.settle)
      // An agent's asset request runs as its own kind, never as the lead's call, whatever the agent's approval mode.
      if (isAssetCard(row.toolName)) return answerAssetCard(row, answer, byUserId, deps)
      // An agent's ask to merge its branch: merged only by a person's own press, as them.
      if (isMergeCard(row.toolName)) return answerMergeCard(row, answer, byUserId, deps)
      if (answer === 'decline') {
        if (!(await deps.settle(operationId, { state: 'CANCELLED', noReport: true, result: { summary: declinedLine(note) } }))) {
          throw new HttpError(409, NOT_WAITING)
        }
        return
      }
      if (!row.args) throw new HttpError(409, 'This request holds nothing to run.')
      if (!(await deps.start(operationId))) throw new HttpError(409, NOT_WAITING)
      const call: ApprovedCall = { operationId, conversationId: row.conversationId, turnId: row.turnId, toolName: row.toolName, args: row.args }
      deps.detach(
        deps.run(call, byUserId)
          .catch((err: unknown): OperationEnd => {
            deps.logError(`${row.toolName} failed in operation ${operationId}`, err)
            return { state: 'FAILED', error: `${row.toolName} failed` }
          })
          .then(async end => { await deps.settle(operationId, end) })
          .catch(err => deps.logError(`Could not record the end of operation ${operationId}`, err)),
      )
    },
  }
}

const logger = new Logger('ConversationToolCalls')

export const toolCallOwner: OperationOwner = createToolCallOwner({
  async read(operationId) {
    const row = await prisma.operation.findUnique({
      where: { id: operationId },
      select: { id: true, kind: true, state: true, conversationId: true, turnId: true, toolName: true, args: true },
    })
    if (!row) return null
    return { ...row, args: row.args ? openJson<Record<string, unknown>>(row.args) : null }
  },
  async start(operationId) {
    const { count } = await prisma.operation.updateMany({
      where: { id: operationId, state: 'WAITING_FOR_APPROVAL' },
      data: { state: 'RUNNING', promoted: true },
    })
    return count === 1
  },
  settle: (operationId, end) => settleOperation(operationId, end),
  run: runApprovedCall,
  detach: work => { void work },
  logError: (message, err) => logger.error(message, err),
})
