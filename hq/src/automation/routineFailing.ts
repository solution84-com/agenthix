/**
 * The notice after a routine's runs fail three times in a row: a persistent notification to the person it runs for,
 * raised once per streak and cleared when one of its runs finishes. Checked whenever one of its runs settles
 * (routineFiring.ts, routineRunStatus.ts). Skipped firings and runs still going are left out.
 */
import { prisma } from 'wasp/server'
import type { RoutineRunState } from '@prisma/client'
import { ROUTINE_FAILING_TYPE } from '../notifications/notificationKinds'
import { clearPersistentNotification, raisePersistentNotification } from '../notifications/persistent'

/** How many failed runs in a row tell the routine's person. */
export const FAILING_STREAK = 3

const SETTLED: RoutineRunState[] = ['FINISHED', 'FAILED', 'STOPPED']

/** From the settled runs newest first: raise on FAILING_STREAK failures, clear once the newest of them finished. */
export function streakVerdict(newestFirst: RoutineRunState[]): 'raise' | 'clear' | 'keep' {
  const newest = newestFirst.slice(0, FAILING_STREAK)
  if (newest.length === FAILING_STREAK && newest.every(s => s === 'FAILED')) return 'raise'
  return newest[0] === 'FINISHED' ? 'clear' : 'keep'
}

export async function checkRoutineFailing(routineId: string): Promise<void> {
  const routine = await prisma.routine.findUnique({ where: { id: routineId }, select: { id: true, title: true, onBehalfOfUserId: true } })
  if (!routine) {
    await clearPersistentNotification(ROUTINE_FAILING_TYPE, routineId)
    return
  }
  const runs = await prisma.routineRun.findMany({
    where: { routineId, state: { in: SETTLED } }, orderBy: { createdAt: 'desc' }, take: FAILING_STREAK, select: { state: true },
  })
  const verdict = streakVerdict(runs.map(r => r.state))
  if (verdict === 'clear') await clearPersistentNotification(ROUTINE_FAILING_TYPE, routineId)
  if (verdict !== 'raise') return
  // Whoever it runs for now is told; whoever it ran for before no longer is.
  await clearPersistentNotification(ROUTINE_FAILING_TYPE, routineId, { exceptUserIds: [routine.onBehalfOfUserId] })
  await raisePersistentNotification([routine.onBehalfOfUserId], {
    type: ROUTINE_FAILING_TYPE,
    subjectKey: routineId,
    title: `${routine.title} failed ${FAILING_STREAK} times in a row`,
    body: `Its last ${FAILING_STREAK} runs failed. It keeps running on its schedule.`,
    actionLabel: 'Open routine',
    actionUrl: `/routines/${routineId}`,
  })
}
