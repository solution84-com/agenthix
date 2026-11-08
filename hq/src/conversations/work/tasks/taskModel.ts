/**
 * The model of a task a conversation's lead creates or runs on the person's behalf (models from one place, part 4).
 * In order, for any run of a task:
 *
 * 1. A model the person's words name to the lead is a fixed pick: on create_task it is stored as the task's own
 *    model; on run_task it is kept on the run's operation, for that run only.
 * 2. The task's own model, when it has one (one a person set elsewhere is kept and honoured).
 * 3. A task the lead creates with no model named takes the conversation's current model as its own, so it keeps it
 *    wherever it is run from later. A task run from a conversation that has no model of its own runs on the
 *    conversation's model, for that run only; it falls to the next allowed when that one may not run there.
 * 4. Otherwise, the agent's default model, then the organisation's.
 */
import { HttpError, prisma } from 'wasp/server'
import type { ModelViaProvider } from '@agenthix/core'
import { choiceValue, parseChoiceValue } from '../../access/talkingModel'
import { openJson } from '../../sealing'
import { checkedTaskModel } from '../../../models-settings/taskModelChoice'
import { BEFORE_ITS_RUN } from './taskOperations'

/** What a task operation's sealed arguments hold. */
export type TaskOperationArgs = { skill?: unknown; model?: string; modelNote?: string }

/** The conversation's current model as a picker value; null before its first turn fixed one. */
export async function conversationModelValue(conversationId: string): Promise<string | null> {
  const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { talkingProviderId: true, talkingModel: true } })
  return row?.talkingProviderId && row.talkingModel ? choiceValue({ providerId: row.talkingProviderId, model: row.talkingModel }) : null
}

/**
 * The model a task the lead creates is stored with: the one the person's words named, checked (its refusal is
 * thrown), else the conversation's own when it may run in the task's project, else none, which follows the defaults.
 */
export async function modelForCreatedTask(input: {
  named: string | undefined
  conversationId: string
  projectId: string
  agentId?: string | null
  userId: string
}): Promise<string | null> {
  const where = { projectId: input.projectId, agentId: input.agentId ?? null, userId: input.userId }
  if (input.named) return checkedTaskModel(input.named, where)
  const own = await conversationModelValue(input.conversationId)
  if (!own) return null
  try {
    return await checkedTaskModel(own, where)
  } catch (err) {
    // Ruled out in the task's project: the task follows the defaults rather than naming a model it may not run on.
    if (err instanceof HttpError && err.statusCode < 500) return null
    throw err
  }
}

/**
 * What a conversation asked of the run a task is about to start: the oldest of its operations still waiting for a
 * run, the model the person's words named for this run, and the conversation behind it. Null when no conversation
 * asked: a run from a board, a start time or an agent.
 */
export async function conversationAskOfRun(taskId: string): Promise<{ operationId: string; args: string | null; pick: ModelViaProvider | null; conversationId: string } | null> {
  const op = await prisma.operation.findFirst({
    where: { kind: 'TASK', taskId, state: { in: BEFORE_ITS_RUN } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, args: true, conversationId: true },
  })
  if (!op) return null
  const named = op.args ? openJson<TaskOperationArgs>(op.args).model : undefined
  return { operationId: op.id, args: op.args, pick: parseChoiceValue(named), conversationId: op.conversationId }
}
