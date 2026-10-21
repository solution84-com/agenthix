import { hqConnectionManager } from '../../server/hq/hqConnection'
import { RUN_WAITING_EVENT, type RunStreamEvent, type RunStatusEvent, type RunWaitingEvent } from '@agenthix/core'

/** Replaces every globalThis.__wasp_io__ emit in the moved runtime.
 *  Fire-and-forget by design (plan D4): a closed channel drops frames; transcripts are
 *  the durable record and hq's reconcile covers status. */
export const siteStream = {
  stream(e: RunStreamEvent): void { hqConnectionManager.sendEvent('run.stream', e) },
  status(e: RunStatusEvent): void { hqConnectionManager.sendEvent('run.status', e) },
  waiting(e: RunWaitingEvent): void { hqConnectionManager.sendEvent(RUN_WAITING_EVENT, e) },
}
