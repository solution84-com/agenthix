/**
 * The lead's own calls cut by an hq restart (conversation layer spec, What "the call carries on" relies on). A call
 * hq was making itself lived in hq's process, so after a restart its operation is *uncertain*, and is reconciled
 * here: a read is run again, as the person who asked for it and as their authority stands now, and its result
 * delivered once, as any detached call's is; a write is not run again — it is reported as unknown whether it
 * happened, and the lead is told to check before doing it again, never to repeat it blindly.
 *
 * A read is run again only from the arguments its row holds. A row that holds none is reported as cut short:
 * nothing changed, so asking again is safe.
 */
import { HttpError, prisma } from 'wasp/server'
import { callOperation } from '../../../server/controlplane/operations'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { isReadTool } from '../../../server/controlplane/turnCaller'
import { Logger } from '../../../server/utils/logger'
import type { OperationEnd, SettleOperation, TurnCapability } from '../../contract'
import { openJson } from '../../sealing'
import { capResult } from '../../tools/turnTools'
import { mintTurnCapability } from '../../tools/mintTurnCapability'
import { leadAgentId } from '../../taskThread/lead'

const logger = new Logger('ConversationReconcile')

/** A write cut by a restart: what its card says, which the lead also reads. */
export const WRITE_UNKNOWN =
  'HQ restarted before this finished, so whether it happened is unknown. Check before doing it again; do not repeat it without checking.'
/** A read cut by a restart that cannot be run again here: nothing changed. */
export const READ_CUT_SHORT = 'HQ restarted before this finished. It only read, so nothing changed and it is safe to ask again.'

export interface UncertainCall {
  id: string
  conversationId: string
  turnId: string | null
  toolName: string
  authorisedById: string
  args: string | null
}

export interface CallReconcileDeps {
  /** Runs the read again, as the person who asked for it. */
  rerun(call: UncertainCall, args: unknown): Promise<unknown>
  settle: SettleOperation
  logError(message: string, err: unknown): void
}

/** A refusal's own words; anything else is not for a person to read. */
function refusalOf(err: unknown): string | null {
  if (err instanceof ControlPlaneError) return err.message
  if (err instanceof HttpError && err.statusCode < 500) return err.message
  return null
}

/** Takes the uncertain call to run it again, once: false when another sweep took it first. */
async function claim(operationId: string): Promise<boolean> {
  const { count } = await prisma.operation.updateMany({ where: { id: operationId, state: 'UNCERTAIN' }, data: { state: 'RUNNING', promoted: true } })
  return count === 1
}

async function endOfRead(call: UncertainCall, deps: CallReconcileDeps): Promise<OperationEnd> {
  if (call.args === null) return { state: 'FAILED', error: READ_CUT_SHORT }
  try {
    const result = capResult(await deps.rerun(call, openJson<unknown>(call.args)))
    return { state: 'COMPLETED', result: { summary: typeof result === 'string' ? result : JSON.stringify(result) } }
  } catch (err) {
    const refusal = refusalOf(err)
    if (refusal) return { state: 'FAILED', error: refusal }
    deps.logError(`${call.toolName} failed when run again in operation ${call.id}`, err)
    return { state: 'FAILED', error: `${call.toolName} failed` }
  }
}

/** Reconciles one uncertain call. True when this sweep ended it. */
export async function reconcileCall(call: UncertainCall, deps: CallReconcileDeps): Promise<boolean> {
  if (!isReadTool(call.toolName)) return deps.settle(call.id, { state: 'FAILED', error: WRITE_UNKNOWN })
  if (call.args !== null && !(await claim(call.id))) return false
  return deps.settle(call.id, await endOfRead(call, deps))
}

async function rerunAsAsker(call: UncertainCall, args: unknown): Promise<unknown> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: call.conversationId },
    select: { id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true },
  })
  const agentId = conversation ? await leadAgentId(conversation) : null
  if (!conversation || !agentId) throw new ControlPlaneError('not_found', "This conversation's agent no longer exists")
  const capability: TurnCapability = await mintTurnCapability({
    conversation,
    turnId: call.turnId ?? `reconcile:${call.id}`,
    agentId,
    actingUserId: call.authorisedById,
  })
  return callOperation(call.toolName, { kind: 'turn', turn: capability }, args)
}

/** Every uncertain call of every conversation, reconciled. Returns how many this sweep ended. */
export async function reconcileUncertainCalls(deps: CallReconcileDeps): Promise<number> {
  const calls = await prisma.operation.findMany({
    where: { kind: 'TOOL', state: 'UNCERTAIN' },
    select: { id: true, conversationId: true, turnId: true, toolName: true, authorisedById: true, args: true },
    orderBy: { createdAt: 'asc' },
  })
  let ended = 0
  for (const call of calls) {
    try {
      if (await reconcileCall(call, deps)) ended++
    } catch (err) {
      deps.logError(`could not reconcile uncertain operation ${call.id}`, err)
    }
  }
  return ended
}

export function callReconcileDeps(settle: SettleOperation): CallReconcileDeps {
  return { rerun: rerunAsAsker, settle, logError: (message, err) => logger.error(message, err) }
}
