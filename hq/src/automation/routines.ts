/**
 * A routine's life (adr-0177, spec D15, D22, N6): made, changed, switched on or off, deleted, and switched off by
 * the system when the person it runs for can no longer work in its project.
 *
 * Anyone who may work in the project may make or change a routine (N6), and every change, switching it on or off
 * included, makes it run on behalf of whoever made the change: the access its runs use is that of the last person who
 * decided what it does. The callers check who may; this keeps the stored next due time right.
 *
 * Only a change to the schedule, or switching it on, moves the next due time. Any other change leaves it as it is,
 * so a change saved in the moment a routine fires never moves that firing on: the scheduler claims a firing by
 * compare-and-set on the stored time (routineFiring.ts) and fires the routine as it is when it claims it.
 */
import { prisma } from 'wasp/server'
import type { Prisma, Routine } from '@prisma/client'
import { CRON_MAX_LENGTH, ROUTINE_INSTRUCTIONS_MAX_LENGTH, ROUTINE_TITLE_MAX_LENGTH, nextCronTime, routineScheduleProblem } from '@agenthix/core'
import { nudgeScheduler } from './schedulerNudge'

export class RoutineError extends Error {}

/** Who made or changed a routine: a person (through a connection, when they used one), or an agent in a run, for its person. */
export type RoutineActor =
  | { kind: 'person'; userId: string; connectionId?: string }
  | { kind: 'agent'; agentId: string; sessionId: string; userId: string }

/** Why the system switched a routine off. */
export const ROUTINE_LOST_ACCESS_REASON =
  'the person it ran for can no longer work in its project; anyone who works in it can switch it back on, and it then runs for them'

export type RoutineInput = {
  title: string
  agentId: string | null
  instructions: string
  cron: string
  timezone: string
  /** Checked by the caller for the project, the agent and the person (`checkedTaskModel`). */
  modelChoice: string | null
}

export type RoutineChange = Partial<RoutineInput> & { enabled?: boolean }

function checkText(input: Partial<RoutineInput>): void {
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new RoutineError('A routine needs a name')
    if (input.title.length > ROUTINE_TITLE_MAX_LENGTH) throw new RoutineError(`A routine's name is at most ${ROUTINE_TITLE_MAX_LENGTH} characters`)
  }
  if (input.instructions !== undefined && input.instructions.length > ROUTINE_INSTRUCTIONS_MAX_LENGTH) {
    throw new RoutineError(`A routine's instructions are at most ${ROUTINE_INSTRUCTIONS_MAX_LENGTH.toLocaleString('en')} characters`)
  }
  if (input.cron !== undefined && (typeof input.cron !== 'string' || input.cron.length > CRON_MAX_LENGTH)) {
    throw new RoutineError(`A cron expression is at most ${CRON_MAX_LENGTH} characters`)
  }
}

function checkSchedule(cron: string, timezone: string): void {
  const problem = routineScheduleProblem(cron, timezone)
  if (problem) throw new RoutineError(problem)
}

/** A routine's agent must be one assigned to its project; null leaves it unable to fire until one is chosen. */
async function checkAgent(projectId: string, agentId: string | null): Promise<void> {
  if (!agentId) return
  const assigned = await prisma.projectAgent.findUnique({
    where: { projectId_agentId: { projectId, agentId } }, select: { agentId: true },
  })
  if (!assigned) throw new RoutineError('That agent is not assigned to this project')
}

function actorFields(a: RoutineActor) {
  return {
    createdByUserId: a.userId,
    createdByAgentId: a.kind === 'agent' ? a.agentId : null,
    createdBySessionId: a.kind === 'agent' ? a.sessionId : null,
    createdByConnectionId: a.kind === 'person' ? a.connectionId ?? null : null,
  }
}

export function nextDueAfter(r: Pick<Routine, 'cron' | 'timezone'>, after: Date): Date | null {
  return nextCronTime(r.cron, r.timezone, after)
}

/** Makes a routine, on, its first firing at the schedule's first time from now. */
export async function createRoutine(projectId: string, input: RoutineInput, actor: RoutineActor, now: Date = new Date()): Promise<Routine> {
  checkText(input)
  const cron = input.cron.trim()
  checkSchedule(cron, input.timezone)
  await checkAgent(projectId, input.agentId)
  const routine = await prisma.routine.create({
    data: {
      projectId, title: input.title.trim(), agentId: input.agentId, instructions: input.instructions, cron,
      timezone: input.timezone, modelChoice: input.modelChoice, enabled: true,
      nextDueAt: nextCronTime(cron, input.timezone, now), onBehalfOfUserId: actor.userId, ...actorFields(actor),
    },
  })
  nudgeScheduler()
  return routine
}

/**
 * Changes a routine; it then runs on behalf of `actor`'s person. Switching it on clears a reason the system gave
 * for switching it off and fires it next at the schedule's next time from now; switching it off clears its time.
 */
export async function changeRoutine(routineId: string, change: RoutineChange, actor: RoutineActor, now: Date = new Date()): Promise<Routine> {
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new RoutineError('Routine not found')
  checkText(change)
  const cron = change.cron?.trim() ?? routine.cron
  const timezone = change.timezone ?? routine.timezone
  const scheduleChanged = cron !== routine.cron || timezone !== routine.timezone
  if (scheduleChanged) checkSchedule(cron, timezone)
  if (change.agentId !== undefined && change.agentId !== routine.agentId) await checkAgent(routine.projectId, change.agentId)

  const enabled = change.enabled ?? routine.enabled
  const turnedOn = enabled && !routine.enabled
  const data: Prisma.RoutineUpdateInput = {
    ...(change.title !== undefined ? { title: change.title.trim() } : {}),
    ...(change.agentId !== undefined ? { agentId: change.agentId } : {}),
    ...(change.instructions !== undefined ? { instructions: change.instructions } : {}),
    ...(change.modelChoice !== undefined ? { modelChoice: change.modelChoice } : {}),
    ...(scheduleChanged ? { cron, timezone } : {}),
    enabled,
    ...(enabled ? {} : { nextDueAt: null }),
    ...(enabled && (turnedOn || scheduleChanged) ? { nextDueAt: nextCronTime(cron, timezone, now) } : {}),
    // A reason the system gave stays while it is off, unless a person switched it off themselves.
    ...(enabled || change.enabled === false ? { pausedReason: null } : {}),
    onBehalfOfUserId: actor.userId,
  }
  const updated = await prisma.routine.update({ where: { id: routineId }, data })
  if (updated.enabled) nudgeScheduler()
  return updated
}

/** Deletes a routine and its record of runs; runs already on a site end as they would. */
export async function deleteRoutine(routineId: string): Promise<void> {
  await prisma.routine.deleteMany({ where: { id: routineId } })
}

/**
 * Switches off the routines of a person who can no longer work in their projects, saying why. Anyone who still
 * works in the project may switch one back on, and it then runs on their behalf.
 */
export async function pauseRoutinesForLostAccess(where: Prisma.RoutineWhereInput): Promise<number> {
  const { count } = await prisma.routine.updateMany({
    where: { AND: [where, { enabled: true }] },
    data: { enabled: false, nextDueAt: null, pausedReason: ROUTINE_LOST_ACCESS_REASON },
  })
  return count
}
