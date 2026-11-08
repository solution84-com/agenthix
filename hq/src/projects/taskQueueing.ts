/**
 * What every write that puts a task in its agent's line records (adr-0089,
 * adr-0091, adr-0175): what started it, who did, and how deep it is in a chain
 * of work agents started for each other.
 *
 * A task is only ever in line because someone started it — a person's Run or an
 * agent's Start, approving a tool request, a start time, an agent's tool. It
 * starts as soon as its agent is free, in rank order. A person's start counts
 * from depth 0; an agent's is one deeper than the run that started it
 * (server/controlplane/startGate.ts). (`claimTask` in agents/taskSlotClaim.ts
 * writes the same when it claims.)
 */
import { withExecutionState } from './executionState'
import type { Prisma } from '@prisma/client'
import type { ExplicitStarter } from '../agents/agentLineOrder'
import { queuedBy, type Queuer } from './taskOnBehalfOf'

/** The fields of a task someone started: in its agent's line, at `depth` (0 unless an agent started it). */
export function askedToStart(
  startedBy: ExplicitStarter,
  queuer: Queuer | null,
  reason: string | null,
  depth = 0,
): Prisma.TaskUpdateManyMutationInput {
  return {
    ...withExecutionState({ runState: 'RUN_QUEUED', runStateReason: reason }),
    runStartedBy: startedBy,
    // Whose behalf the run is on is written now, with what started it (adr-0095): a person's start is theirs, any
    // other nobody's. A run's end then claims the next task in line with it, never with a name left from an earlier run.
    runOnBehalfOfUserId: startedBy === 'person' && queuer?.kind === 'person' ? queuer.userId : null,
    queueDepth: startedBy === 'agent' ? depth : 0,
    ...queuedBy(queuer),
  }
}
