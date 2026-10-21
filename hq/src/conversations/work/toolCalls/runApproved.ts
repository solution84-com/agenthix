/**
 * Running a call a person approved (conversation layer spec, Approval): the lead's own call, as it was asked, as
 * the person who answered — their authority in the conversation's place, minted now, with that one tool let
 * through — never as the person who was asked, and never with the reason the card showed.
 */
import { prisma } from 'wasp/server'
import { HttpError } from 'wasp/server'
import { callOperation } from '../../../server/controlplane/operations'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { allowOnce } from '../../../server/controlplane/turnCaller'
import type { OperationEnd, ToolCallOutcome } from '../../contract'
import { openText } from '../../sealing'
import { mintTurnCapability } from '../../tools/mintTurnCapability'
import { capResult } from '../../tools/turnTools'
import { toolNamed } from './registryLater'
import { leadAgentId } from '../../taskThread/lead'

export interface ApprovedCall {
  operationId: string
  conversationId: string
  turnId: string | null
  toolName: string
  args: Record<string, unknown>
}

/** A result as the completion card and the lead read it: capped, as text. */
export function summaryOf(result: unknown): string {
  const capped = capResult(result)
  return typeof capped === 'string' ? capped : JSON.stringify(capped)
}

/** A refusal's own words; anything else is not for a person to read. */
function refusalOf(err: unknown): string | null {
  if (err instanceof ControlPlaneError) return err.message
  if (err instanceof HttpError && err.statusCode < 500) return err.message
  return null
}

async function startedLine(operationId: string): Promise<string> {
  const row = await prisma.operation.findUnique({ where: { id: operationId }, select: { title: true } })
  const title = row ? openText(row.title) : 'the work'
  return `Started ${title}; its result comes back here when it ends.`
}

/** How a conversation tool's answer ends the call that asked for it. Work it started reports on its own. */
async function endOf(outcome: ToolCallOutcome): Promise<OperationEnd> {
  switch (outcome.status) {
    case 'done': return { state: 'COMPLETED', result: { summary: summaryOf(outcome.result) } }
    case 'accepted':
    case 'waitingApproval': return { state: 'COMPLETED', result: { summary: await startedLine(outcome.operationId) }, noReport: true }
    case 'refused': return { state: 'FAILED', error: outcome.reason }
  }
}

export async function runApprovedCall(call: ApprovedCall, answererId: string): Promise<OperationEnd> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: call.conversationId },
    select: { id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true },
  })
  const agentId = conversation ? await leadAgentId(conversation) : null
  if (!conversation || !agentId) return { state: 'FAILED', error: "This conversation's agent no longer exists" }
  try {
    const minted = await mintTurnCapability({
      conversation, turnId: call.turnId ?? `approval:${call.operationId}`, agentId, actingUserId: answererId,
    })
    const capability = allowOnce(minted, call.toolName)
    const own = await toolNamed(call.toolName)
    if (own) return await endOf(await own.run(capability, call.args, { signal: new AbortController().signal }))
    const result = await callOperation(call.toolName, { kind: 'turn', turn: capability }, call.args)
    return { state: 'COMPLETED', result: { summary: summaryOf(result) } }
  } catch (err) {
    const refusal = refusalOf(err)
    if (refusal) return { state: 'FAILED', error: refusal }
    throw err
  }
}
