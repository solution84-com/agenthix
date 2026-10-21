/**
 * Sending into a busy conversation (person-scoped execution spec §2). A
 * per-user setting, `UserSettings.busyConversationMode`, decides what a
 * message sent into a session whose turn is still running does: WAIT (the
 * default, today's behaviour) queues it behind that turn, and this module
 * does nothing; INTERRUPT stops the running turn first.
 *
 * Follow-up (person-scoped execution): the cancel below carries
 * `reason: 'interrupted'`, so the site records the run's error as
 * "Interrupted by <the sender>" rather than "Stopped by <them>" — the two
 * read differently in the run's history.
 *
 * Cancelling every active run on the session is enough — the caller does not
 * need to wait for the cancelled run to actually finish before dispatching
 * the new message. The site's own run queue (`runQueueKey.ts`/`runQueue.ts`)
 * chains the next run for a key onto whatever promise is still outstanding
 * for it, whether or not that promise has settled yet: if the cancelled run's
 * turn has not finished when the new one is dispatched, the new turn is
 * queued behind it exactly as it would be under WAIT; if it has already
 * finished, the turn has already ended and starting the new one immediately
 * is correct. Either way the new turn cannot start before the stopped one
 * has actually ended, so hq only needs the cancel to be ACKNOWLEDGED by the
 * site, never to poll for the run's actual exit.
 */
import { prisma } from 'wasp/server'
import * as siteRuntimeStore from './siteRuntimeStore'
import { personName } from './transcriptAuthors'

export type InterruptResult = { interrupted: number }

/**
 * @param userId whose preference decides this — the person sending the
 *   message, not necessarily the session's owner (a task session's chat can
 *   be sent into by anyone with task access).
 * @param siteId the session's site, already resolved by the caller the same
 *   way its own dispatch resolves it (`dispatchService.resolveSiteIdForSession`).
 */
export async function interruptIfBusy(userId: string, siteId: string, sessionId: string): Promise<InterruptResult> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { busyConversationMode: true },
  })
  if (settings?.busyConversationMode !== 'INTERRUPT') return { interrupted: 0 }

  const activeRuns = await siteRuntimeStore.listRuns(siteId, { sessionId, activeOnly: true })
  // A task's session is shared, so the run records who interrupted it.
  const by = activeRuns.length > 0 ? await personName(userId) : undefined
  for (const run of activeRuns) {
    await siteRuntimeStore.cancelRun(siteId, run.id, 'interrupted', by)
  }
  return { interrupted: activeRuns.length }
}

/**
 * Send now, on a message waiting behind a running reply: the running reply is
 * stopped for it, recorded as interrupted by the sender, and the waiting
 * message goes next — the site's queue starts it as soon as the stopped turn
 * has ended. Messages still waiting are left as they are.
 */
export async function interruptForWaitingMessage(userId: string, siteId: string, sessionId: string): Promise<InterruptResult> {
  const running = (await siteRuntimeStore.listRuns(siteId, { sessionId, activeOnly: true })).filter(r => r.status === 'RUNNING')
  const by = running.length > 0 ? await personName(userId) : undefined
  for (const run of running) await siteRuntimeStore.cancelRun(siteId, run.id, 'interrupted', by)
  return { interrupted: running.length }
}
