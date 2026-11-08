/**
 * Whether a tool call may start a task (adr-0175, adr-0091, adr-0095): the one
 * gate every agent's tool that starts work passes — `run_task`, and
 * `create_task` asked to start.
 *
 *   - A person's connection is that person acting (adr-0090): the run is the
 *     person's, at depth 0 — and only where the connection holds *Start work*,
 *     whichever tool asks (create_task is *Change tasks*; starting is not).
 *   - An agent may start a task only in a run a person started, at that
 *     person's request. The run it starts is the agent's, not the person's: it
 *     carries the turn limit and cannot start another, so one press of Run can
 *     never become an unbounded chain of runs counted as the person's.
 *   - Its depth is derived in hq from the run's own task (the signed
 *     capability's `taskId`), never from anything the agent or its site sends,
 *     and past the organisation's maximum it is not started.
 *   - A conversation's turn starts work as an operation of its own
 *     (conversations/work/tasks), never through this gate.
 *
 * Nothing else starts work: no pulse, no queue limit (adr-0175).
 */
import { prisma } from 'wasp/server'
import type { CallerContext } from './types'
import { startedByOf } from './runStarter'
import { loadOrgAutomation } from '../../automation/automationStore'
import { CONNECTION_GROUP_INFO } from '../../shared/connections'

/** A run no person started with no task to count from has no depth to give: it never starts work. */
const NO_DEPTH = Number.MAX_SAFE_INTEGER

/** How deep a task this call starts would be. */
export async function startDepthOfCall(ctx: CallerContext): Promise<number> {
  if (ctx.kind === 'connection' || ctx.kind === 'turn') return 0
  if (startedByOf(ctx) === 'person') return 0
  const taskId = ctx.claims.taskId
  if (!taskId) return NO_DEPTH
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { queueDepth: true } })
  return task && Number.isInteger(task.queueDepth) ? task.queueDepth + 1 : NO_DEPTH
}

export const TURN_START_NOTE =
  'The task was not started: a task made in a conversation waits for a person to start it.'

export function notPersonRunNote(startedBy: string): string {
  return `The task was not started: only a run a person started may start another task, and this run was started by the ${startedBy}. It waits for a person to run it.`
}

export const NO_START_WORK_NOTE =
  `The task was not started: this connection's "${CONNECTION_GROUP_INFO.start_work.label}" permission is off. ` +
  'Its person can turn it on in Settings → Connections.'

export function depthNote(maxDepth: number): string {
  return (
    `The task was not started: it would be deeper in a chain of work agents started for each other than this ` +
    `organisation's maximum depth of ${maxDepth} allows. It waits for a person to run it.`
  )
}

/**
 * Who a start this call makes is by, at what depth, and why it may not be made, if it may not. `startedBy` is
 * 'person' for a person's connection (on behalf of `personId`) and 'agent' for an agent in a person's run, whose
 * start is nobody's.
 */
export type StartGate =
  | { refusal: null; startedBy: 'person' | 'agent'; personId: string | null; depth: number }
  | { refusal: string }

export async function startGate(ctx: CallerContext): Promise<StartGate> {
  if (ctx.kind === 'turn') return { refusal: TURN_START_NOTE }
  if (ctx.kind === 'connection') {
    if (!ctx.connection.groups.has('start_work')) return { refusal: NO_START_WORK_NOTE }
    return { refusal: null, startedBy: 'person', personId: ctx.connection.userId, depth: 0 }
  }
  const startedBy = startedByOf(ctx)
  if (startedBy !== 'person') return { refusal: notPersonRunNote(startedBy) }
  const depth = await startDepthOfCall(ctx)
  const { maxDepth } = await loadOrgAutomation()
  if (depth > maxDepth) return { refusal: depthNote(maxDepth) }
  return { refusal: null, startedBy: 'agent', personId: null, depth }
}
