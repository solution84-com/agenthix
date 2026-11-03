/**
 * What a run gives back when it ends, split out of AgentEngine.processRun's
 * `finally` (R-071). Runs on every exit path — normal completion, a thrown error
 * or an aborted run — and never rejects: a problem tearing one resource down must
 * not turn a finished run into a rejected promise or skip the resources after it.
 */
import { revokeRunToken } from '../../server/runtime/runTokens'
import { Logger } from '../../server/utils/logger'
import { agentContainerManager } from './AgentContainerManager'
import {
  credentialHomeInUse,
  enterCredentialHome,
  holdUnreportedCredential,
  leaveCredentialHome,
  serialiseCredentialHome,
} from './agentCredentials'
import { clearRunCredential } from './boundaryClaudeHome'
import { within } from './containerLifecycle'
import { endRunWindowMs } from './containerRuns'
import type { RunLaunchSink } from './runLaunch'
import { leaveSubscriptionLogin } from './subscriptionLogins'
import { releasePinnedMemory } from './pinnedMemoryFiles'
import { endCodeWork } from '../../server/branches/codeWorkRun'

const logger = new Logger('AgentEngine')

/**
 * The sink a run's launch fills in (runLaunch.ts), with one addition: naming
 * the run's Claude home on it counts the run in that home
 * (`enterCredentialHome`). The launch names the home before the container is
 * prepared and the credential written into it, so from that moment a run
 * ending elsewhere in the same home leaves the document where it is. The one
 * matching `leaveCredentialHome` is in `releaseRunResources`.
 */
export function createRunLaunchSink(): RunLaunchSink {
  let claudeHome: string | null = null
  return {
    run: null,
    containerName: null,
    runToken: null,
    subscription: null,
    resourceBaseline: null,
    get claudeHome() { return claudeHome },
    set claudeHome(home: string | null) {
      if (home === claudeHome) return
      if (claudeHome) leaveCredentialHome(claudeHome)
      if (home) enterCredentialHome(home)
      claudeHome = home
    },
  }
}

export async function releaseRunResources(sink: RunLaunchSink, renewal: { stop(): void } | null): Promise<void> {
  // §2a: stop the renewal timer. A leaked timer would keep firing renewals
  // forever after the run ends.
  renewal?.stop()
  // §H4: revoke the run's MCP bearer — the container's credential must not
  // outlive the run it was minted for.
  if (sink.runToken) revokeRunToken(sink.runToken)
  // A granted subscription: a last look at the home, and the run counted out
  // of its login's copies. A refresh hq could not be sent stays in the home,
  // past the removal below, for the next run there to report.
  if (sink.subscription) {
    const unreported = await leaveSubscriptionLogin(sink.subscription).catch(() => false)
    if (unreported) holdUnreportedCredential(sink.subscription.home)
  }
  // A person's pinned items do not stay on the disk after the run that was given them.
  if (sink.pinnedMemory) await releasePinnedMemory(sink.pinnedMemory.home, sink.pinnedMemory.sessionId)
  const home = sink.claudeHome
  const lastInHome = home ? leaveCredentialHome(home) : false
  // A run on a branch's copy: what it left is committed and its branch brought back (codeWorkRun.ts). Never throws.
  if (sink.codeWork) await endCodeWork(sink.codeWork)
  if (sink.containerName) agentContainerManager.markRunEnd(sink.containerName)
  // The credential leaves the home only with the last run using it (spec §2):
  // the document is bound into every run in the home, and a credential must
  // not outlive the authority that granted it — but the runs still going were
  // granted it too. The same rule with or without a container: dev mode has a
  // home and no container, and a run that failed before its container was
  // ready has a home and no container name.
  if (home && lastInHome) await removeCredentialIfUnused(home)
}

/**
 * Checked again once this home's turn comes: a run that arrived since the
 * last one left has written, or is about to write, its own document, and
 * keeps it. Bounded by the end-of-run window, because this is disk work on a
 * bind mount and a wedged one would otherwise hold the run's slot with no
 * deadline. Logged, never thrown — the next run in the home clears or
 * overwrites the document on arrival anyway.
 */
async function removeCredentialIfUnused(home: string): Promise<void> {
  // The deadline is inside the serialised step, not around it, so a hung
  // removal gives the home's turn back when it is abandoned rather than
  // holding every later operation on the home behind it.
  const removal = serialiseCredentialHome(home, async () => {
    if (credentialHomeInUse(home)) return
    await within(clearRunCredential(home), endRunWindowMs(), 'clearing the run credential')
  })
  await removal.catch((err: unknown) => {
    logger.warn(`Could not clear the credential in ${home}: ${err instanceof Error ? err.message : String(err)}`)
  })
}
