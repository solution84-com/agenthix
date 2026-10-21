/**
 * What every write that makes a task queued records (adr-0089, adr-0091): who
 * queued it, how deep it is in a chain of agent-queued work, and whether it
 * waits in its agent's line or for the next round.
 *
 * Two kinds of queueing:
 *
 *   - **For the pulse** — a column that queues, `create_task` asked to queue, a
 *     template confirmed, a schedule reached with automation off. Nobody asked
 *     for it to start now: it waits in its agent's line for the boundary's
 *     pulse, or, where the boundary throttles, for the next round
 *     (RUN_THROTTLED). Its depth is the queuer's.
 *   - **Asked to start** — a person's Run, approving a tool request, a schedule,
 *     `run_task`. It starts as soon as its agent is free, whatever the
 *     boundary's automation, and counts from depth 0: a person asked for it.
 *     (`claimTask` in agents/taskSlotClaim.ts writes the same when it claims.)
 */
import type { Prisma } from '@prisma/client'
import type { RunStartedBy } from '@agenthix/core'
import { effectiveForProject } from '../automation/automationStore'
import { queuedBy, type Queuer } from './taskOnBehalfOf'

/** Where a task queued for the pulse waits: RUN_THROTTLED where the boundary's throttle is on. */
export async function pulseQueueState(projectId: string): Promise<'RUN_QUEUED' | 'RUN_THROTTLED'> {
  return (await effectiveForProject(projectId)).throttle ? 'RUN_THROTTLED' : 'RUN_QUEUED'
}

/** The fields of a task queued for the pulse at `depth` (0 for a person, adr-0091). */
export async function queuedForPulse(
  projectId: string,
  queuer: Queuer | null,
  depth: number,
  reason: string | null = null,
): Promise<Prisma.TaskUpdateManyMutationInput> {
  return {
    runState: await pulseQueueState(projectId),
    runStateReason: reason,
    runStartedBy: null,
    queueDepth: depth,
    ...queuedBy(queuer),
  }
}

/** The fields of a task someone asked to start: in line ahead of the pulse's, at depth 0. */
export function askedToStart(startedBy: RunStartedBy, queuer: Queuer | null, reason: string | null): Prisma.TaskUpdateManyMutationInput {
  return { runState: 'RUN_QUEUED', runStateReason: reason, runStartedBy: startedBy, queueDepth: 0, ...queuedBy(queuer) }
}
