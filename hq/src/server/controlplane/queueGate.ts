/**
 * Whether a task an agent's tool call would queue may be queued (spec §2): the
 * depth (adr-0091) and the queue limit. Past either, the task is still created
 * or moved, but not queued, and the tool result says why; it waits for a
 * person. A person — a person's connection — is never limited, and what they
 * queue is at depth 0.
 *
 * The depth is derived in hq from the run's own task (the signed capability's
 * `taskId`), never from anything the agent or its site sends:
 *
 *   - a run a person started — their chat, their Run — queues at depth 0;
 *   - a run the pulse, a schedule or an agent's `run_task` started queues one
 *     deeper than the task that run is for.
 */
import { prisma } from 'wasp/server'
import type { CallerContext } from './types'
import { startedByOf } from './runStarter'
import { agentQueuedCount, effectiveForProject } from '../../automation/automationStore'

/** A run no person started with no task to count from never queues: it has no depth to give. */
const NO_DEPTH = Number.MAX_SAFE_INTEGER

/** How deep a task this call queues would be. */
export async function queueDepthOfCall(ctx: CallerContext): Promise<number> {
  if (ctx.kind === 'connection' || ctx.kind === 'turn') return 0
  if (startedByOf(ctx) === 'person') return 0
  const taskId = ctx.claims.taskId
  if (!taskId) return NO_DEPTH
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { queueDepth: true } })
  return task && Number.isInteger(task.queueDepth) ? task.queueDepth + 1 : NO_DEPTH
}

export const TURN_QUEUE_NOTE =
  'The task was not queued: a task made in a conversation waits for a person to start it.'

export const QUEUE_LIMIT_NOTE =
  'The task was not queued: agents in this project already hold as many queued tasks as its queue limit allows. ' +
  'It waits for a person to queue it.'

export function depthNote(maxDepth: number): string {
  return (
    `The task was not queued: it would be deeper in a chain of work agents queued for each other than this project's ` +
    `maximum depth of ${maxDepth} allows. It waits for a person to queue it.`
  )
}

export type QueueGate = { depth: number; refusal: string | null }

/** The depth a task this call queues would take, and why it may not be queued, if it may not. */
export async function queueGate(ctx: CallerContext, projectId: string): Promise<QueueGate> {
  // A task queued now is work started now, which a conversation commissions as its own operation, not as a quick call.
  if (ctx.kind === 'turn') return { depth: 0, refusal: TURN_QUEUE_NOTE }
  const depth = await queueDepthOfCall(ctx)
  if (ctx.kind === 'connection') return { depth, refusal: null }
  const eff = await effectiveForProject(projectId)
  if (depth > eff.maxDepth) return { depth, refusal: depthNote(eff.maxDepth) }
  if ((await agentQueuedCount(projectId)) >= eff.queueLimit) return { depth, refusal: QUEUE_LIMIT_NOTE }
  return { depth, refusal: null }
}
