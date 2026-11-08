/**
 * An agent's line (spec "The words", D14): the tasks started for one agent in a project, taken one at a time in the
 * project's one rank order. A task with no rank yet goes after every ranked one; ties fall to the task's number, so
 * the order is total. The database orders `rank` by code unit (its collation is "C"), as `lineOrder` does here, so the
 * claim (taskSlotClaim.ts) and the screens' "next" (queueNotes.ts) always agree.
 */
import type { Prisma } from '@prisma/client'
import type { RunStartedBy } from '@agenthix/core'

export const LINE_ORDER: Prisma.TaskOrderByWithRelationInput[] = [{ rank: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }]

/** What may start a task in an agent's line: an explicit act (adr-0175). 'pulse' is never one. */
export const EXPLICIT_STARTERS = ['person', 'schedule', 'agent'] as const satisfies readonly RunStartedBy[]

export type ExplicitStarter = (typeof EXPLICIT_STARTERS)[number]

/** A stored starter, when it names an explicit act; anything else (a 'pulse' left behind, junk) starts nothing. */
export function explicitStarterOf(value: unknown): ExplicitStarter | null {
  return typeof value === 'string' && (EXPLICIT_STARTERS as readonly string[]).includes(value) ? (value as ExplicitStarter) : null
}

type Ordered = { rank: string | null; number: number }

export function lineOrder(a: Ordered, b: Ordered): number {
  if (a.rank !== b.rank) {
    if (a.rank === null) return 1
    if (b.rank === null) return -1
    return a.rank < b.rank ? -1 : 1
  }
  return a.number - b.number
}
