import { execFile } from 'node:child_process'
import { Logger } from '../../server/utils/logger'
import { labelKey, resolveComposeProjectName, siteIdFilterArgs } from './containerLabels'
import { notifyContainerDestroyed } from './containerDestroyed'
import type { ContainerState } from './containerTypes'

/**
 * Container lifecycle sweeps — orphan removal (boot) and idle teardown (ADR-0049).
 * Split out of AgentContainerManager.ts in phase 5d-2 (moved verbatim, only
 * `this.` plumbing adjusted) to keep that file under the repo's 500-line convention. This half never participates in the start/reuse
 * decision — `ensureRunning`/`_start` stay in the parent class and the mount
 * signature in its own module —
 * and this class only ever REMOVES containers the parent isn't actively using.
 *
 * `AgentContainerManager` composes one instance, sharing its OWN `containerStates`
 * map by reference (not a copy) — `markRunStart`/`markRunEnd`/`ensureRunning`
 * writes there are visible here immediately, and this class's own removals are
 * visible back to the parent the same way. `removeOrphans`/`sweepIdle` on
 * `AgentContainerManager` delegate here unchanged, so callers (setup.ts) see no
 * API difference.
 */

const logger = new Logger('AgentContainerManager')

/** ADR-0049: never sweep a container touched within this window, regardless of
 *  idleMs. Closes the PRE-decision half of the sweep/ensure race, where
 *  ensureRunning's `_isRunning` check has passed (the container exists and is
 *  running) but the run hasn't exec'd into it yet — so activeRuns is still 0 and
 *  sweepIdle could otherwise decide to tear it down out from under the run
 *  that's about to use it. The POST-decision half — sweepIdle has already
 *  decided to remove and is awaiting the `rm` — is closed separately by
 *  `ContainerState.stopping` (see ensureRunning and sweepIdle). */
const SWEEP_GRACE_FLOOR_MS = 60_000

// Promisify-style wrapper — avoids `node:child_process/promises` which doesn't exist.
// Using a local helper (not util.promisify) so the import can be mocked in tests.
// Exported: AgentContainerManager.ts's start/reuse half (ensureRunning, _start,
// stopAgent) needs this same helper too — one implementation, not two
// independently-mockable copies of the same execFile wrapper.
//
// `clientEnv` is for a value that must reach the container but must not sit on
// the command line, where every user on the host can read it from the process
// table: the argv names the variable (`-e NAME`) and the docker client, which
// inherits this process's environment plus these, hands the value over. Left
// out, the call is the plain three-argument execFile every test here mocks.
export function docker(args: string[], clientEnv?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const done = (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }
    if (clientEnv) execFile('docker', args, { env: { ...process.env, ...clientEnv } }, done)
    else execFile('docker', args, done)
  })
}

/**
 * `docker` with a deadline, for the calls that sit on a run's exit path.
 *
 * A wedged container or an unresponsive daemon makes `docker` hang rather than
 * fail, and a `.catch` never fires on a hang — so end-of-run work (a
 * single-use container's removal) would hold the run's concurrency slot
 * and its boundary's whole queue with nothing in any log. The same reasoning the
 * recreate path's drain window already runs on, applied to the other end of a
 * run.
 *
 * Rejecting ABANDONS the exec rather than cancelling it: whatever docker is
 * doing carries on, and the caller decides what a failure means. The deadline
 * wraps `docker` rather than passing execFile a `timeout` option, so the helper
 * keeps the three-argument execFile call every test in this repo mocks.
 */
export function dockerWithin(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return within(docker(args), timeoutMs, `docker ${args[0]}`)
}

/**
 * The same deadline for any other step on a run's exit path — the credential
 * removal, which is file work on a bind mount a wedged daemon or a stalled
 * volume can hang just as it hangs `docker`. Abandons rather than cancels, for
 * the same reason: `work` carries on, and the caller decides what a rejection
 * means.
 */
export function within<T>(work: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} did not finish within ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    work.then(
      value => { clearTimeout(timer); resolve(value) },
      err => { clearTimeout(timer); reject(err) },
    )
  })
}

/** Deadline for each docker call made by a sweep, so a wedged daemon fails the sweep rather than hanging it. */
export const DOCKER_SWEEP_TIMEOUT_MS = 30_000

export class ContainerLifecycle {
  constructor(private containerStates: Map<string, ContainerState>) {}

  private getOrCreateState(name: string): ContainerState {
    let state = this.containerStates.get(name)
    if (!state) {
      state = { activeRuns: 0, lastActivity: Date.now() }
      this.containerStates.set(name, state)
    }
    return state
  }

  /**
   * Is a preview serving out of this container?
   *
   * Read by BOTH sweeps, and it has to be: a preview is a process inside the
   * container a boundary already has, so removing the container ends work
   * somebody is watching — and the idle sweep is not the only way one gets
   * removed. The orphan sweep decides by whether the boundary is in the live
   * set it was handed, which is a question about storage rather than about
   * what is running, so a container serving a preview can be an orphan by that
   * test and still be in use.
   *
   * Asked of the shared state rather than of a registry, so that neither sweep
   * has to be handed a set by its caller. The caller that would build one
   * (setup.ts, at boot) is the caller that cannot: previews live in memory and
   * the memory is empty at boot.
   *
   * Public because it is read by a THIRD removal path as well —
   * `AgentContainerManager.stopAgent` — and one predicate for all three is the
   * point. A second copy is how one of them forgets.
   */
  hasPreview(name: string): boolean {
    return (this.containerStates.get(name)?.previewHolds ?? 0) > 0
  }

  /** Filters shared with removeOrphans' label branch — one function so the two
   *  scans of "this install's boundary containers" cannot drift apart. */
  private scopedBoundaryLabelFilters(): string[] {
    const project = resolveComposeProjectName()
    return [
      '--filter', `label=${labelKey('owner')}`,
      '--filter', `label=com.docker.compose.project=${project}`,
      ...siteIdFilterArgs(),
    ]
  }

  /**
   * Remove containers for storage locations that no longer exist on this site.
   * Called at server startup with the set of live boundaries, each rendered
   * `<ownerType>:<ownerId>` exactly as `_start` stamps the `<namespace>.owner`
   * label; a live boundary's containers are left alone (ensureRunning() manages
   * them).
   *
   * ADR-0057 moved this off the agent: a container belongs to a storage
   * location, so what makes one an orphan is that its location is gone, not
   * that some agent is.
   *
   * Found by label alone, never by a name prefix two sites could share: this
   * install's compose project (`resolveComposeProjectName()`), the boundary
   * label `<namespace>.owner`, and this site's own id (`<namespace>.site`,
   * `siteIdFilterArgs`), so two sites sharing one Docker daemon, even with one
   * namespace, never remove each other's agent containers. A container without
   * those labels is not this site's to remove.
   */
  async removeOrphans(activeBoundaries: Set<string>): Promise<number> {
    try {
      let removed = 0

      const { stdout: labeled } = await dockerWithin([
        'ps', '-a',
        ...this.scopedBoundaryLabelFilters(),
        '--format', `{{.Names}}\t{{.Label "${labelKey('owner')}"}}`,
      ], DOCKER_SWEEP_TIMEOUT_MS)
      for (const line of labeled.trim().split('\n').filter(Boolean)) {
        const [name, owner] = line.split('\t')
        if (!name) continue
        // An empty owner label is treated like a missing one — removed: its
        // boundary cannot be established.
        if (owner && activeBoundaries.has(owner)) continue
        if (this.hasPreview(name)) continue

        const ok = await dockerWithin(['rm', '-f', name], DOCKER_SWEEP_TIMEOUT_MS).then(() => true).catch(() => false)
        if (ok) {
          this.containerStates.delete(name)
          notifyContainerDestroyed(name)
          logger.info(`[container] removed orphan ${name}`)
          removed++
        } else {
          logger.warn(`[container] failed to remove orphan ${name}`)
        }
      }

      return removed
    } catch {
      // Docker not available — skip silently
      return 0
    }
  }

  /**
   * ADR-0049: idle teardown is mandatory, not an optimisation — a boundary
   * otherwise leaves a permanently-running container. Stops this install's
   * boundary containers that have no live run and no activity within `idleMs`.
   * ADR-0057 changed only what this keys by; the mechanism below is unchanged.
   *
   * Lists via the SAME scoped filters as removeOrphans' label branch
   * (`scopedBoundaryLabelFilters`) so the two scans of "this install's boundary
   * containers" cannot drift apart — but only running containers (`docker ps`,
   * no `-a`), since a stopped container is already torn down.
   *
   * A container unknown to in-memory state (e.g. after an hq restart) is
   * ADOPTED with lastActivity = now (first-seen), so it tears down one idle
   * window from now, not instantly. Never stops a container with a live run
   * (activeRuns > 0), an in-flight start (state.starting), or an already
   * in-flight removal (state.stopping), however old its lastActivity — and
   * never stops anything touched within SWEEP_GRACE_FLOOR_MS, regardless of
   * idleMs (see that constant's doc comment for the pre-decision race it closes).
   *
   * Sets `state.stopping` BEFORE awaiting the `rm` — symmetric with `starting`
   * — so a concurrent ensureRunning for the same name can wait for the removal
   * to land instead of reusing a container that's mid-teardown (the
   * POST-decision half of the sweep/ensure race; see ensureRunning).
   */
  async sweepIdle(idleMs: number): Promise<void> {
    // Fail safe: an unparsable/non-positive idle window (e.g. Number('garbage')
    // → NaN) must never be treated as "remove everything past the grace floor" —
    // the caller (setup.ts) already guards this, but the policy must fail safe
    // wherever it's invoked from.
    if (!Number.isFinite(idleMs) || idleMs <= 0) return

    try {
      // The listing is scoped by the BOUNDARY label — what a container belongs
      // to. It still carries the agent handle alongside the name (the run that
      // last (re)created the container) — the query itself is unchanged from
      // when SC-349's write-back read it here to know whose credentials to
      // promote. A refreshed subscription token is reported to hq per run now,
      // at the end of the run that held the credential (AgentEngine.ts's
      // finally, against the run's grant in subscriptionLogins.ts), not at
      // teardown, so this listing no longer needs the handle for that — left
      // in the format string as the cheaper option over re-deriving it
      // elsewhere later.
      const { stdout } = await docker([
        'ps',
        ...this.scopedBoundaryLabelFilters(),
        '--format', `{{.Names}}\t{{.Label "${labelKey('agent')}"}}`,
      ])
      const now = Date.now()

      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const [name] = line.split('\t')
        if (!name) continue
        const state = this.getOrCreateState(name)
        if (state.activeRuns > 0 || this.hasPreview(name) || state.starting || state.stopping) continue
        if (now - state.lastActivity < SWEEP_GRACE_FLOOR_MS) continue
        if (now - state.lastActivity <= idleMs) continue

        const stopPromise = docker(['rm', '-f', name]).then(() => true).catch(() => false)
        state.stopping = stopPromise.then(() => undefined)
        const ok = await stopPromise
        delete state.stopping
        if (ok) {
          this.containerStates.delete(name)
          notifyContainerDestroyed(name)
          logger.info(`[container] removed idle ${name}`)
        } else {
          logger.warn(`[container] failed to remove idle ${name}`)
        }
      }
    } catch {
      // Docker not available — skip silently
    }
  }
}
