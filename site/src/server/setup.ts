// Server bootstrap for the execution site.
//
// The runtime has arrived (phase 5d-2): registration + the outbound
// HQ connection are joined here by everything a running agent execution
// layer needs at boot — container-isolation env validation, the orphan
// container sweep, idle container teardown, a crash-recovery sweep over
// site's own AgentRun (buffered and flushed once the channel opens, since
// the sweep can run before hq is reachable), setting aside memory superseded
// by ADR-0058, the control socket the agenthix-site command drives, and a
// hygiene sweep over expired run tokens. Everything here is
// scoped to what SITE now owns; hq's mirrored sweeps (its own crash recovery, its own
// container sweeps) live in hq/src/server/setup.ts and are unaffected by
// this file until phase 5d-2's cutover.
import { connectFromPairingSecretIfConfigured } from './registration/pairing'
import { addressFollower } from './hq/addressFollow'
import { hqConnectionManager } from './hq/hqConnection'
import { ensureSiteConfig } from './siteConfig'
import { setContainerSiteId } from '../agents/runtime/containerLabels'
import { listStorageBoundaries } from './storage/storageBoundaries'
import { runCrashRecoverySweep, flushBootSweepBuffer } from './runtime/bootSweep'
import { bringBackPending } from './branches/codeWorkRun'
import { sweepExecutorLeftovers } from '../executor/runCleanup'
import { sweepExpiredRunTokens } from './runtime/runTokens'
import { setAfterPackageStored } from '../packages/packageMethods'
import { schedulePackageEviction } from '../packages/packageEvictionScheduler'
import { sweepIncomingDir } from '../packages/packageCache'
import { startKnowledgePruning } from './knowledge/pruning'
import { usageOutbox } from './modelRelay/usageOutbox'
import { startControlSocket } from './control/controlSocket'
import { validateEnv } from './validateEnv'
import { clearSignInScratch } from './login/claudeLogin'
import { hostFigures } from './host/hostFigures'
import { Logger } from './utils/logger'

const logger = new Logger('startup')

export async function setupServer(): Promise<void> {
  const problems = validateEnv()
  if (problems.length > 0) {
    logger.error(`Missing required env vars:\n${problems.join('\n')}`)
    process.exit(1)
  }

  // Before anything else: registration needs this installation's siteId, and
  // nothing else creates it.
  setContainerSiteId((await ensureSiteConfig()).siteId)

  // The site's command reaches it here (ADR-0065); started before registration
  // from the environment so a failed one can be retried by hand at once.
  try {
    await startControlSocket()
  } catch (err) {
    logger.error(`${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // Registered before anything that could possibly open the channel — fires
  // on every open for the life of the process (hqConnection.ts's onOpen),
  // including this boot's very first one.
  hqConnectionManager.onOpen(flushBootSweepBuffer)

  // Crash-recovery sweep A over site's own AgentRun (SC-342) — buffered, and
  // deliberately run BEFORE connectFromPairingSecretIfConfigured() below (spec review):
  // a FRESH registration fires an unawaited `hqConnectionManager.restart()`
  // (registrationService.ts) that can open the socket before this sweep ever
  // gets to populate the buffer. If that race lands the other way, the
  // buffered frames sit waiting for a LATER reconnect that may never come,
  // instead of flushing on this boot's own first open.
  const { swept } = await runCrashRecoverySweep()
  if (swept > 0) logger.info(`Cleaned up ${swept} orphaned run(s) — buffered for hq.`)

  // Workflow runs a crash left behind (workflows spec part 2): recorded as failed, and their step containers,
  // networks, folders and snapshots removed, before this boot can start a run. hq reads the outcome with workflow.get.
  try {
    const left = await sweepExecutorLeftovers()
    if (left.runs + left.containers + left.folders > 0) {
      logger.info(`Cleaned up after workflow runs: ${left.runs} unfinished, ${left.containers} container(s), ${left.folders} folder(s).`)
    }
  } catch (err) {
    logger.warn(`Could not clean up after earlier workflow runs: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Sign-ins a crash cut short: their folders may still hold a person's tokens.
  await clearSignInScratch().catch(err =>
    logger.warn(`Could not clear sign-ins left by an earlier run: ${err instanceof Error ? err.message : String(err)}`))

  // Package cache hygiene: nothing can
  // legitimately still be mid-put before this boot has even opened a channel,
  // so every leftover `.incoming/<uuid>` from a crash mid-put is cleared
  // unconditionally here.
  await sweepIncomingDir(0)

  // Eviction registers here (Task 12); nothing runs until a packages.put
  // completes and fires this hook.
  setAfterPackageStored(schedulePackageEviction)

  // The host service's ceilings and protections (host-management spec §8), read
  // before the first health report and the first run, and every 30 s after.
  // Without HOST_FIGURES_SOCKET no host service runs this site, and this does nothing.
  if (hostFigures.managed) {
    await hostFigures.refresh()
    hostFigures.start()
  }

  // hq's own site is paired by a shared secret and needs no registration.
  await connectFromPairingSecretIfConfigured()
  // A move of hq that a restart interrupted: carry on checking the new address (host-management spec §13).
  await addressFollower.resume()

  // Branches whose copies had commits not yet back when the site stopped (live preview spec, *Commits, and the
  // branch coming back*): brought back once hq is reachable, so it hears that they moved. Once per process.
  let broughtBack = false
  hqConnectionManager.onOpen(() => {
    if (broughtBack) return
    broughtBack = true
    void bringBackPending().catch(() => 0)
  })

  // Package cache hygiene: periodic eviction + `.incoming` sweep. Every site
  // holds a package cache regardless of whether it also runs containers, so
  // this interval is registered unconditionally — never inside the
  // AGENT_CONTAINER_ISOLATION branch below, so it runs exactly once
  // regardless of that setting.
  setInterval(() => {
    schedulePackageEviction()
    // Same sweep as at boot above, but bounded
    // to entries over an hour old here — a put still streaming in is never
    // removed out from under it.
    sweepIncomingDir().catch(() => {})
  }, 60_000).unref()

  // Kept versions of knowledge pages: pruned once a day (knowledge spec, *Versions and pruning*).
  startKnowledgePruning()

  if (process.env.AGENT_CONTAINER_ISOLATION === 'true') {
    // ADR-0057: a container belongs to a storage location, so what makes one an
    // orphan at boot is that its location is gone — not that an agent is.
    const activeBoundaries = await listStorageBoundaries()
    const { agentContainerManager } = await import('../agents/runtime/AgentContainerManager')
    const { positiveNumberEnv } = await import('../agents/runtime/containerLimits')
    const removed = await agentContainerManager.removeOrphans(activeBoundaries)
    if (removed > 0) {
      logger.info(`Removed ${removed} orphaned agent container(s).`)
    }

    // ADR-0066: a network is created alongside its container but swept
    // separately (containerNetwork.ts's own doc comment) — catch up here on
    // whatever a crash left behind, the same way the orphan sweep above does
    // for containers.
    const { sweepAgentNetworks } = await import('../agents/runtime/containerNetwork')
    const networks = await sweepAgentNetworks().catch(() => 0)
    if (networks > 0) logger.info(`Removed ${networks} leftover agent network(s).`)

    // ADR-0049: idle teardown is mandatory, not an optimisation — same
    // semantics as hq's setup.ts, including the NaN guard: an unparsable
    // AGENT_CONTAINER_IDLE_MINUTES must fall back to the default, not
    // propagate — a NaN comparison in sweepIdle's window check would otherwise
    // invert the policy and remove everything past the 60s grace floor instead
    // of respecting a 30min default. Read through the shared container-knob
    // reader (containerLimits.ts) rather than an inline copy of it: this was
    // the rule's first home, and a second implementation of it is how one knob
    // keeps the guard while the next quietly loses it.
    // Whether this kernel can contain an agent's commands (Landlock ABI 6):
    // asked now, in the background so boot does not wait on a first image
    // start, and asked again before the first agent command if this could not.
    const { checkLandlockAtStartup } = await import('../agents/runtime/landlockCheck')
    void checkLandlockAtStartup()

    // Live previews (live preview spec sections 4 and 6): the guard runs from here, and what a restart left of any
    // live preview is put right before hq can ask for one.
    const { startLivePreviews } = await import('./livePreviews/livePreviewService')
    await startLivePreviews().catch(err => logger.error(`Live previews could not start on this site: ${err instanceof Error ? err.message : String(err)}`))

    const idleMinutes = positiveNumberEnv('AGENT_CONTAINER_IDLE_MINUTES', 30)
    // Networks swept after containers: a container removed by this same tick
    // must not be counted as still using its network by the sweep that follows.
    setInterval(() => {
      agentContainerManager.sweepIdle(idleMinutes * 60_000)
        .then(() => sweepAgentNetworks())
        .catch(() => {})
    }, 60_000).unref()
  }

  // Run-token registry hygiene (runTokens.ts's own doc comment: lazy eviction
  // on read already covers the common case; this only reclaims memory for a
  // token whose run crashed hard enough that nothing ever resolves it again).
  setInterval(() => {
    const swept = sweepExpiredRunTokens()
    if (swept > 0) logger.info(`Swept ${swept} expired run token(s).`)
  }, 5 * 60_000).unref()

  // Usage reports an earlier run of the site left waiting for hq go out now (usageOutbox.ts).
  usageOutbox().start()

  // No-op until a credential exists; otherwise dials hq's control channel and
  // reconnects with backoff.
  await hqConnectionManager.start()
}
