/**
 * Why a task's run asks for approval, for its card and its notification: the sentence of its last reply about what
 * it asked for (requestReason), never the reply itself, which may hold the run's result. The reply is read from the
 * run on its site; when that read fails, the frame's own excerpt of it is used.
 */
import type { RunStatusEvent } from '@agenthix/core'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { requestReason } from '../conversations/work/workers/runReads'

export async function approvalReasonOfRun(siteId: string, e: RunStatusEvent): Promise<string> {
  const asked = e.manifestPending
  const reply = await siteRuntimeStore.getRun(siteId, e.runId).then(run => run?.outputText ?? null, () => null)
  return requestReason(reply ?? asked?.summary ?? null, asked?.pendingManifest)
}
