/**
 * HQ's own health (logs and diagnostics spec, Health): when it started, its
 * version, whether its database answers, when its scheduler last ran, and how
 * many sites it knows. The scheduler tells this module each time it ticks.
 */
import { prisma } from 'wasp/server'
import { BUILD_INFO } from '../server/buildInfo'

export type SchedulerTick = { at: Date; ok: boolean }

let lastTick: SchedulerTick | null = null

export function noteSchedulerTick(ok: boolean, at: Date = new Date()): void {
  lastTick = { at, ok }
}

export type HqHealth = {
  runningSince: Date
  version: string
  commit: string
  built: string
  databaseAnswers: boolean
  /** When the scheduler last ran, and whether that tick finished; null before the first. */
  schedulerLastTick: SchedulerTick | null
  /** Sites this organisation has, not counting removed ones. */
  sitesKnown: number
}

export async function readHqHealth(): Promise<HqHealth> {
  let databaseAnswers = true
  let sitesKnown = 0
  try {
    sitesKnown = await prisma.executionSite.count({ where: { status: { not: 'REVOKED' } } })
  } catch {
    databaseAnswers = false
  }
  return {
    runningSince: new Date(Date.now() - process.uptime() * 1000),
    version: BUILD_INFO.version,
    commit: BUILD_INFO.commit,
    built: BUILD_INFO.built,
    databaseAnswers,
    schedulerLastTick: lastTick,
    sitesKnown,
  }
}

/** Test-only. */
export function __resetSchedulerTickForTests(): void {
  lastTick = null
}
