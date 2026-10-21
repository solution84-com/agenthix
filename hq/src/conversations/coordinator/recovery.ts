/**
 * Recovery (conversation layer spec, Failure, recovery and observability): what an hq restart, or a process
 * that died, leaves behind is put right.
 *
 * - A lock whose lease ran out: its turn is failed with "HQ restarted" — what it streamed lived in the dead
 *   process — and the lock released.
 * - At start, a turn left running that holds no lock is failed the same way, and a tool call hq was making
 *   itself, left running, is marked uncertain: whether it happened is not known. Every uncertain call is then
 *   reconciled (work/reconcile): a read is run again and delivered once, a write reported as unknown.
 * - Task operations stranded by a change on their task's board are read against their task and its run.
 * - Messages still waiting, and cards still awaiting a turn, are scheduled again, in order.
 *
 * Workers' briefs and tasks' runs are reconciled when their site connects (work/reconcile), not here: at start
 * no site has dialled in yet.
 *
 * Run at hq's start and then every lease, since a lease held at the restart runs out only after it.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import { callReconcileDeps, reconcileStrandedTaskOperations, reconcileUncertainCalls } from '../work/reconcile'
import type { CallReconcileDeps } from '../work/reconcile/calls'
import { abandonTurnIn, awaitingCardsWhere, HQ_RESTARTED, untakenWhere } from './claim'
import { conversationEvents } from './events'
import { TURN_LEASE_MS } from './lock'
import { settleOperation } from './mailbox'
import { scheduleConversation } from './scheduler'

const logger = new Logger('ConversationRecovery')

export interface Recovered {
  turnsFailed: number
  toolCallsUncertain: number
  /** Uncertain calls this sweep ended: reads run again, writes reported as unknown. */
  callsReconciled: number
  /** Task operations read again because their task can no longer run for them. */
  taskOperationsRead: number
  conversationsScheduled: number
}

async function abandon(conversationId: string, turnId: string, onlyIfExpired: Date | null): Promise<boolean> {
  const failed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    if (onlyIfExpired) {
      const row = await tx.conversation.findUnique({ where: { id: conversationId }, select: { activeTurnId: true, activeTurnLeaseUntil: true } })
      const stillExpired = row?.activeTurnId === turnId && (row.activeTurnLeaseUntil === null || row.activeTurnLeaseUntil < onlyIfExpired)
      if (!stillExpired) return null
    }
    return abandonTurnIn(tx, conversationId, turnId, HQ_RESTARTED, new Date())
  })
  if (!failed) return false
  conversationEvents.message(conversationId, failed)
  conversationEvents.turn({ conversationId, turnId, state: 'FAILED', error: HQ_RESTARTED })
  return true
}

export async function recoverConversations(
  opts: { atStart: boolean },
  now: Date = new Date(),
  calls: CallReconcileDeps = callReconcileDeps(settleOperation),
): Promise<Recovered> {
  let turnsFailed = 0
  const expired = await prisma.conversation.findMany({
    where: { activeTurnId: { not: null }, OR: [{ activeTurnLeaseUntil: null }, { activeTurnLeaseUntil: { lt: now } }] },
    select: { id: true, activeTurnId: true },
  })
  for (const c of expired) if (await abandon(c.id, c.activeTurnId!, now)) turnsFailed++

  let toolCallsUncertain = 0
  if (opts.atStart) {
    const held = await prisma.conversation.findMany({ where: { activeTurnId: { not: null } }, select: { activeTurnId: true } })
    const orphans = await prisma.inferenceTurn.findMany({
      where: { state: { in: ['QUEUED', 'RUNNING'] }, id: { notIn: held.map(c => c.activeTurnId!) } },
      select: { id: true, conversationId: true },
    })
    for (const t of orphans) if (await abandon(t.conversationId, t.id, null)) turnsFailed++
    ;({ count: toolCallsUncertain } = await prisma.operation.updateMany({
      where: { kind: 'TOOL', state: 'RUNNING' },
      data: { state: 'UNCERTAIN' },
    }))
  }

  const callsReconciled = await reconcileUncertainCalls(calls)
  const taskOperationsRead = await reconcileStrandedTaskOperations(TURN_LEASE_MS, now)

  const waiting = await prisma.conversationMessage.findMany({
    where: { AND: [{ OR: [untakenWhere(), awaitingCardsWhere()] }, { conversation: { status: { not: 'CLOSED' } } }] },
    distinct: ['conversationId'],
    select: { conversationId: true },
  })
  for (const w of waiting) scheduleConversation(w.conversationId)

  const recovered = { turnsFailed, toolCallsUncertain, callsReconciled, taskOperationsRead, conversationsScheduled: waiting.length }
  if (turnsFailed + toolCallsUncertain + callsReconciled + taskOperationsRead > 0) {
    logger.info(
      `recovered conversations: ${turnsFailed} turn(s) failed, ${toolCallsUncertain} tool call(s) uncertain, ` +
        `${callsReconciled} uncertain call(s) reconciled, ${taskOperationsRead} task operation(s) read again`,
    )
  }
  return recovered
}

let timer: NodeJS.Timeout | null = null

/** At hq's start, from server setup: recovers now, then every lease. */
export function startConversationRecovery(intervalMs = TURN_LEASE_MS): void {
  if (timer) return
  const sweep = (atStart: boolean) =>
    recoverConversations({ atStart }).catch(err => logger.error('Conversation recovery failed', err))
  void sweep(true)
  timer = setInterval(() => void sweep(false), intervalMs)
  timer.unref()
}
