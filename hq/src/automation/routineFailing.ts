/**
 * The notice after three failed rounds in a row (every screen reviewed spec
 * §3): a persistent notification to the routine's person, raised once per
 * streak and cleared when a round succeeds — the next one, or a failed one run
 * again (roundState.ts's streakVerdict).
 *
 * The scheduler calls it every tick, and a run's end nudges a tick. It looks
 * only at the routines whose rounds changed since it last looked, and those
 * with a notice open; the first look after hq starts takes every routine with
 * a round, so nothing missed while hq was down stays missed.
 */
import { prisma } from 'wasp/server'
import { ROUTINE_FAILING_TYPE, OPEN_STATUSES } from '../notifications/notificationKinds'
import { clearPersistentNotification, raisePersistentNotification } from '../notifications/persistent'
import { lastRoundStates } from './routineSummary'
import { FAILING_STREAK, streakVerdict } from './roundState'

let lookedAt: Date | null = null

/** Forgets when it last looked, as a restart does. For tests. */
export function resetFailingRoutinesLook(): void {
  lookedAt = null
}

/** Raises or clears each changed routine's notice. Returns how many routines it looked at. */
export async function checkFailingRoutines(now: Date): Promise<number> {
  const since = lookedAt
  lookedAt = now
  const [changed, open] = await Promise.all([
    prisma.task.findMany({
      where: { routineId: { not: null }, ...(since ? { updatedAt: { gte: since } } : {}) },
      select: { routineId: true },
      distinct: ['routineId'],
    }),
    prisma.notification.findMany({
      where: { type: ROUTINE_FAILING_TYPE, status: { in: [...OPEN_STATUSES] }, subjectKey: { not: null } },
      select: { subjectKey: true },
      distinct: ['subjectKey'],
    }),
  ])
  const ids = new Set([...changed.map(t => t.routineId!), ...open.map(n => n.subjectKey!)])
  for (const id of ids) await checkRoutine(id, now)
  return ids.size
}

export async function checkRoutine(routineId: string, now: Date): Promise<void> {
  const routine = await prisma.routine.findUnique({ where: { id: routineId }, select: { id: true, title: true, onBehalfOfUserId: true } })
  if (!routine) {
    await clearPersistentNotification(ROUTINE_FAILING_TYPE, routineId)
    return
  }
  const verdict = streakVerdict((await lastRoundStates(routineId, now)).reverse())
  if (verdict === 'clear') await clearPersistentNotification(ROUTINE_FAILING_TYPE, routineId)
  if (verdict !== 'raise') return
  // Someone who took the routine over gets it; whoever had it before no longer does.
  await clearPersistentNotification(ROUTINE_FAILING_TYPE, routineId, { exceptUserIds: [routine.onBehalfOfUserId] })
  await raisePersistentNotification([routine.onBehalfOfUserId], {
    type: ROUTINE_FAILING_TYPE,
    subjectKey: routineId,
    title: `${routine.title} failed ${FAILING_STREAK} times in a row`,
    body: `Its last ${FAILING_STREAK} rounds failed. It keeps creating rounds on its schedule.`,
    actionLabel: 'Open routine',
    actionUrl: `/routines/${routineId}`,
  })
}
