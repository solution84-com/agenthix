/**
 * Run limits (agents-own-schedule spec §7). An org sets the defaults; a project
 * may only tighten them; the stricter applies at use. The site enforces what
 * hq sends in the run dispatch, so a limit holds when hq restarts.
 */
import { prisma } from 'wasp/server'
import {
  DEFAULT_RUN_LIMITS,
  RUN_TIME_LIMIT_MINUTES_BOUNDS,
  RUN_TURN_LIMIT_BOUNDS,
  effectiveRunLimits,
  type RunLimits,
} from '@agenthix/core'
import type { OverrideBoundary } from '../overrides/agentOverrideService'

export class RunLimitsValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'RunLimitsValidationError' }
}

export async function getOrgRunLimits(): Promise<RunLimits> {
  const org = await prisma.org.findFirst({ select: { runTimeLimitMinutes: true, runTurnLimit: true } })
  return org
    ? { timeLimitMinutes: org.runTimeLimitMinutes, turnLimit: org.runTurnLimit }
    : DEFAULT_RUN_LIMITS
}

/** A project's own choice, or nulls for one that chose nothing. */
export async function getProjectRunLimits(projectId: string): Promise<{ timeLimitMinutes: number | null; turnLimit: number | null }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { runTimeLimitMinutes: true, runTurnLimit: true },
  })
  return { timeLimitMinutes: project?.runTimeLimitMinutes ?? null, turnLimit: project?.runTurnLimit ?? null }
}

/**
 * The limits a run in this boundary gets. A person's own space has no choice of
 * its own yet (it is a personal project, which carries one) and gets the org's.
 */
export async function runLimitsFor(boundary: OverrideBoundary | null): Promise<RunLimits> {
  const org = await getOrgRunLimits()
  if (boundary?.type !== 'project') return org
  return effectiveRunLimits(org, await getProjectRunLimits(boundary.id))
}

function integerIn(value: unknown, label: string, bounds: { min: number; max: number }): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new RunLimitsValidationError(`${label} must be a whole number from ${bounds.min} to ${bounds.max}`)
  }
  return value
}

export function validateOrgRunLimits(values: unknown): RunLimits {
  const v = (values ?? {}) as Record<string, unknown>
  return {
    timeLimitMinutes: integerIn(v.timeLimitMinutes, 'The time limit (minutes)', RUN_TIME_LIMIT_MINUTES_BOUNDS),
    turnLimit: integerIn(v.turnLimit, 'The turn limit', RUN_TURN_LIMIT_BOUNDS),
  }
}

/** A project's choice: null clears it; a number may not exceed the org's value, so a project only tightens. */
export function validateProjectRunLimits(
  values: unknown,
  org: RunLimits,
): { timeLimitMinutes: number | null; turnLimit: number | null } {
  const v = (values ?? {}) as Record<string, unknown>
  const pick = (value: unknown, label: string, bounds: { min: number; max: number }, orgValue: number): number | null => {
    if (value === null || value === undefined) return null
    const n = integerIn(value, label, bounds)
    if (n > orgValue) throw new RunLimitsValidationError(`${label} can only be tightened: the organisation's limit is ${orgValue}`)
    return n
  }
  return {
    timeLimitMinutes: pick(v.timeLimitMinutes, 'The time limit (minutes)', RUN_TIME_LIMIT_MINUTES_BOUNDS, org.timeLimitMinutes),
    turnLimit: pick(v.turnLimit, 'The turn limit', RUN_TURN_LIMIT_BOUNDS, org.turnLimit),
  }
}
