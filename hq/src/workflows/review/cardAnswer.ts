/**
 * Answering a workflow's approval card (workflows spec part 1, *Approving from the card*; part 5, U4). Only the
 * place's administrators may answer, and only by their own tap: an approval passed on by the conversation's agent
 * from the person's words is refused, since a version is approved as it was shown. Approve goes through
 * `approveWorkflowVersion` with `via: 'card'` and the hash the card showed, so the plain checks' card rule is
 * applied there once more. The card never declines a version: declining it is the full review's, so a decline, or
 * a conversation closing, only takes the card away and leaves the version waiting.
 */
import { HttpError, prisma } from 'wasp/server'
import type { SettleOperation } from '../../conversations/contract'
import { approveWorkflowVersion } from '../approve'
import { mayAdministerPlace } from '../placeAccess'
import { WORKFLOW_APPROVAL_TOOL, type WorkflowCardArgs } from './cardTool'

export const APPROVE_BY_TAP =
  'A workflow version is approved by a person pressing Approve on its card or on its page, not through the agent. Nothing was changed.'

export function isWorkflowCard(toolName: string): boolean {
  return toolName === WORKFLOW_APPROVAL_TOOL
}

/** Why this person may not answer the card this way, or null when they may. */
export async function workflowAnswerRefusal(
  op: { boundaryType: 'user' | 'project' | null; boundaryId: string | null },
  answer: 'approve' | 'decline',
  answererId: string,
  via: 'card' | 'turn',
): Promise<string | null> {
  if (via === 'turn' && answer === 'approve') return APPROVE_BY_TAP
  if (!op.boundaryType || !op.boundaryId) return 'This request names no place. Nothing was changed.'
  if (await mayAdministerPlace({ type: op.boundaryType, id: op.boundaryId }, answererId)) return null
  const who = op.boundaryType === 'user' ? 'the person whose storage this is' : 'one of this project\'s administrators'
  return `Only ${who} can answer this; ask them. Nothing was changed.`
}

function argsOf(raw: Record<string, unknown> | null): WorkflowCardArgs {
  const a = raw ?? {}
  if (typeof a.workflowId !== 'string' || typeof a.versionId !== 'string' || typeof a.hash !== 'string') {
    throw new HttpError(409, 'This request holds no workflow version. Nothing was changed.')
  }
  return { workflowId: a.workflowId, versionId: a.versionId, hash: a.hash }
}

export async function answerWorkflowCard(
  row: { id: string; args: Record<string, unknown> | null },
  answer: 'approve' | 'decline',
  byUserId: string,
  settle: SettleOperation,
): Promise<void> {
  if (answer === 'decline') {
    await settle(row.id, { state: 'CANCELLED', noReport: true, result: { summary: 'Left for the full review on the workflow\'s page.' } })
    return
  }
  const args = argsOf(row.args)
  const version = await prisma.workflowVersion.findUnique({ where: { id: args.versionId }, select: { state: true, number: true } })
  if (!version || version.state !== 'PROPOSED') {
    await settle(row.id, { state: 'CANCELLED', noReport: true, result: { summary: 'Already decided.' } })
    throw new HttpError(409, `This version was ${version ? 'decided already' : 'removed'}. Nothing was changed.`)
  }
  const approved = await approveWorkflowVersion({ workflowId: args.workflowId, hash: args.hash, via: 'card' }, { kind: 'person', userId: byUserId })
  const summary = `Approved version ${approved.number}: it can be run now${approved.enabled ? '' : ', once the workflow is turned on'}.`
  await settle(row.id, { state: 'COMPLETED', result: { summary } })
}

/**
 * Takes away the cards of versions decided elsewhere (approved or declined on the workflow's page, or superseded), so
 * none is left offering what can no longer be done.
 */
export async function closeWorkflowCards(versionIds: string[], settle: SettleOperation): Promise<void> {
  if (!versionIds.length) return
  const waiting = await prisma.operation.findMany({
    where: { toolName: WORKFLOW_APPROVAL_TOOL, state: 'WAITING_FOR_APPROVAL', idempotencyKey: { in: versionIds.map((id) => `workflow-approval:${id}`) } },
    select: { id: true },
  })
  for (const op of waiting) await settle(op.id, { state: 'CANCELLED', noReport: true, result: { summary: 'Decided on the workflow\'s page.' } })
}
