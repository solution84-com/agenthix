import type { CapabilityClaims } from '@agenthix/core'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'

/**
 * The run a site names for a capability's call, when it is one of that capability's session and of its task if any;
 * null otherwise. The site fills the id in, but a misbehaving one must not be able to name another session's run.
 */
export async function runOfCapability(claims: CapabilityClaims, runId: string) {
  const run = await siteRuntimeStore.getRun(claims.siteId, runId)
  if (!run || run.sessionId !== claims.sessionId || (run.taskId ?? null) !== (claims.taskId ?? null)) return null
  return run
}
