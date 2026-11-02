import fs from 'node:fs/promises'
import { Logger } from '../../server/utils/logger'
import type { CapabilityRunner } from '@agenthix/core'
import { containerNameFor, labelKey, resolveComposeProjectName } from './containerLabels'
import { checkAgentCredentials } from './agentCredentials'
import { harnessHomeBind, prepareHarnessHome, runnerClaudeHome, runnerSkillsStagingDir, writeRunCredential } from './boundaryClaudeHome'
import type { AgentMounts, ContainerKey, ContainerContext, ContainerState } from './containerTypes'
import { docker, ContainerLifecycle } from './containerLifecycle'
import { ensureAgentNetwork, releaseAgentNetwork } from './containerNetwork'
import { buildContainerRunCommand } from './containerRunArgs'
import { prepareOpenCodeConfigMounts } from './openCodeConfigMounts'
import { ContainerRuns } from './containerRuns'
import { mountSignature } from './mountSignature'
import { removeContainersFor, type ContainerRemovalFilter } from './containerRemoval'
import { resolveContainerLimits, type ContainerLimits } from './containerLimits'
import { ReadableRunError } from './readableRunError'
import { mustWaitForBinds, waitForRunsToEnd, BINDS_DRAIN_POLL_MS } from './bindsDrain'
import { hostFigures } from '../../server/host/hostFigures'

const logger = new Logger('AgentContainerManager')

export class AgentContainerManager {
  // Keyed by container NAME, which is boundary × runner (ADR-0074) — nothing here
  // parses an agent handle or a session id back out of it. One entry per
  // container the manager has ever started or adopted: in-flight start dedup,
  // mount signature, and idle-teardown activity tracking (ADR-0049),
  // consolidated so a container's state lives in one place instead of two
  // separately-pruned maps. Pruned on removal (stopAgent, removeOrphans,
  // sweepIdle) — the entry count is bounded by active storage locations rather
  // than by conversations, but a boundary that goes away must still not leave
  // one behind.
  private containerStates = new Map<string, ContainerState>()

  constructor(private readonly bindsDrainPollMs: number = BINDS_DRAIN_POLL_MS) {}

  // The id `docker run` printed for each container this process started, by
  // name — what an end-of-run command addresses instead of the name, so a
  // daemon answering it late cannot land on a container recreated under the
  // same name (containerRuns.ts, `target`). Shared with ContainerRuns.
  private containerIds = new Map<string, string>()

  // Shares `containerStates` BY REFERENCE (containerLifecycle.ts's own doc
  // comment) — removeOrphans/sweepIdle below delegate here unchanged, and every
  // write either class makes to the map is immediately visible to the other.
  private lifecycle = new ContainerLifecycle(this.containerStates)

  // The run-bookkeeping half — markRunStart/markRunEnd — sharing the
  // same map by reference for the same reason (containerRuns.ts). The
  // methods below delegate unchanged, so callers (runLaunch.ts, AgentEngine.ts,
  // the tests) see no API difference.
  private runs = new ContainerRuns(this.containerStates)

  private getOrCreateState(name: string): ContainerState {
    let state = this.containerStates.get(name)
    if (!state) {
      state = { activeRuns: 0, lastActivity: Date.now() }
      this.containerStates.set(name, state)
    }
    return state
  }

  /** ADR-0074: boundary × runner, plus the mode — see `containerNameFor`
   *  (containerLabels.ts). No agent, no session, no task: that context rides
   *  in labels. */
  containerName(key: ContainerKey): string {
    return containerNameFor(key)
  }

  markRunStart(name: string): void {
    this.runs.markRunStart(name)
  }

  markRunEnd(name: string): void {
    this.runs.markRunEnd(name)
  }

  /** See ContainerRuns for why these are not run marks. */
  markPreviewStart(name: string): void {
    this.runs.markPreviewStart(name)
  }

  markPreviewEnd(name: string): void {
    this.runs.markPreviewEnd(name)
  }

  /** See ContainerRuns.forgetWhatDiedWithIt for what a destroyed container's
   *  name has to clear, and why. */
  private forgetWhatDiedWithIt(name: string): void {
    this.runs.forgetWhatDiedWithIt(name)
  }

  async ensureRunning(
    key: ContainerKey,
    ctx: ContainerContext,
    mounts: AgentMounts,
  ): Promise<string> {
    // No agent starts, in a new container or one already up, until the host
    // service's agent protections hold (host-management spec §8). Before
    // anything is written for the run.
    const unprotected = await hostFigures.protectionsProblem()
    if (unprotected) {
      logger.warn(`[container] not starting a run: the host service's agent protections do not hold`)
      throw new ReadableRunError(unprotected)
    }

    const name = this.containerName(key)
    const home = runnerClaudeHome(key)
    // The limits are part of the signature, so a container started under other
    // ceilings is recreated for the next run once no run is left in it — and
    // reused, with what it started with, while runs are.
    const limits = resolveContainerLimits()
    const sig = `${mountSignature(harnessHomeBind(key), mounts.boundary, mounts.locationMode, mounts.readOnly)}|${limits.memory}|${limits.cpus}|${limits.pidsLimit}`

    // Every run, not only the ones that start a container. A runner's
    // container is reused across runs, and the credential hq decided for THIS
    // run has to be in its home before the run executes — a subscription run
    // arriving at a container an API-key run created would otherwise find no
    // OAuth document at all, and a run granted none would inherit whatever the
    // last run left. This also creates the bind source before `docker run` can
    // create it root-owned. A failure here fails the run: the alternative is
    // executing on whatever document the home already held.
    //
    // BEFORE the state is read, not inside the state machine below. Everything
    // past this point reasons about `state` across awaits, and a fresh await
    // inserted ahead of the `stopping` check is enough to make the captured
    // entry stale: a concurrent sweepIdle can finish its `rm` and delete the
    // map entry while this awaits, leaving this holding an object whose
    // `stopping` is gone and whose `mountSig` still matches — which is the
    // reuse-a-container-mid-teardown case ensureRunning's own handshake exists
    // to prevent (pinned by "a concurrent ensureRunning waits for sweepIdle's
    // rm to land"). Doing the write first means there is no capture to stale.
    await writeRunCredential(home, ctx.credential)

    let state = this.getOrCreateState(name)
    state.lastActivity = Date.now()

    try {
      // Deduplicate concurrent starts for the same container name (pre-check)
      if (state.starting) {
        await state.starting
        if (await this.waitedForBinds(name, sig, ctx)) return this.ensureRunning(key, ctx, mounts)
        await checkAgentCredentials({ home, key, containerName: name, credential: ctx.credential, agentHandle: ctx.handle, runtime: ctx.runtime })
        return name
      }

      // A concurrent sweepIdle already decided to remove this container
      // (pre-check) — closes the POST-decision half of the sweep/ensure race
      // (see SWEEP_GRACE_FLOOR_MS for the pre-decision half). Wait for that `rm`
      // to land, then re-fetch state — sweepIdle deletes the map entry once the
      // rm resolves, so `state` may now point to a fresh entry — and fall
      // through to a plain start below rather than trusting _isRunning/mountSig,
      // which can't be relied on while the container is being torn down under us.
      if (state.stopping) {
        await state.stopping
        state = this.getOrCreateState(name)
      } else {
        // Reuse the running container only when its binds are this run's — for a
        // container this process started they always are, since every bind is a
        // function of the key (mountSignature).
        const isRunning = await this._isRunning(name)
        if (isRunning && state.mountSig === sig) {
          await checkAgentCredentials({ home, key, containerName: name, credential: ctx.credential, agentHandle: ctx.handle, runtime: ctx.runtime })
          return name
        }

        // Re-check after the async _isRunning — another concurrent call may
        // have registered the start promise, or sweepIdle the stopping promise,
        // while we were awaiting.
        if (state.starting) {
          await state.starting
          if (await this.waitedForBinds(name, sig, ctx)) return this.ensureRunning(key, ctx, mounts)
          await checkAgentCredentials({ home, key, containerName: name, credential: ctx.credential, agentHandle: ctx.handle, runtime: ctx.runtime })
          return name
        }
        if (state.stopping) {
          await state.stopping
          state = this.getOrCreateState(name)
        }
      }

      // A runner's container serves several runs at once (ADR-0075), so
      // `_start`'s unconditional `rm -f` must never land on one that still has
      // runs in it. Its binds cannot differ from theirs — the same key, the same
      // signature (ADR-0079) — so the only way here with runs counted is that
      // the container looked not-running. Ask once more: a docker inspect that
      // failed transiently must not cost those runs their container. If it
      // really is gone, they have already lost it and starting a new one is
      // right.
      if (this.containerStates.get(name)?.activeRuns) {
        const stillUp = await this._isRunning(name)
        state = this.getOrCreateState(name)
        // Another caller may have started it while that was asked.
        if (stillUp || state.starting) {
          if (state.starting) await state.starting
          if (await this.waitedForBinds(name, sig, ctx)) return this.ensureRunning(key, ctx, mounts)
          await checkAgentCredentials({ home, key, containerName: name, credential: ctx.credential, agentHandle: ctx.handle, runtime: ctx.runtime })
          return name
        }
      }

      const promise = this._start(key, ctx, name, mounts, sig, limits)
      state.starting = promise
      try {
        await promise
      } finally {
        delete state.starting
      }
      await checkAgentCredentials({ home, key, containerName: name, credential: ctx.credential, agentHandle: ctx.handle, runtime: ctx.runtime })
      return name
    } finally {
      // ADR-0049 sweep race (see SWEEP_GRACE_FLOOR_MS): stamp lastActivity again
      // on exit so the container stays inside sweepIdle's grace floor until the
      // run's own markRunStart takes over.
      state.lastActivity = Date.now()
    }
  }

  /**
   * A run on a branch's copy never joins a container started with other binds: it waits for the runs in it to end
   * (`bindsDrain.ts`), and true tells the caller to start over, so the container is made again with the current binds.
   * Runs already in it keep it until they end (spec, *Turning Git on*).
   */
  private async waitedForBinds(name: string, sig: string, ctx: ContainerContext): Promise<boolean> {
    if (!mustWaitForBinds(this.containerStates.get(name), sig, ctx)) return false
    await waitForRunsToEnd(this.containerStates, name, ctx, this.bindsDrainPollMs)
    return true
  }

  private async _isRunning(containerName: string): Promise<boolean> {
    try {
      const { stdout } = await docker([
        'inspect', '--format', '{{.State.Running}}', containerName,
      ])
      return stdout.trim() === 'true'
    } catch {
      return false
    }
  }

  private async _start(
    key: ContainerKey,
    ctx: ContainerContext,
    containerName: string,
    mounts: AgentMounts,
    sig: string,
    limits: ContainerLimits,
  ): Promise<void> {
    // The home, the staging folder inside it and OpenCode's two configuration
    // folders are bound into the container (buildContainerRunCommand); their
    // sources and mount points must exist first, or docker
    // creates them root-owned and neither the run nor the site can write there.
    await prepareHarnessHome(key)
    await fs.mkdir(runnerSkillsStagingDir(key), { recursive: true })
    await prepareOpenCodeConfigMounts(key)

    // Pre-create the boundary's folder and the standard folders inside it as
    // this process (uid 1001). If Docker has to create a missing `-v` source
    // itself, it makes it root-owned, and the agent (appuser) then can't write
    // into it (e.g. mkdir into a location's tree → EACCES). Creating them first
    // keeps them 1001-owned.
    for (const { hostDir } of [mounts.boundary, ...mounts.folders]) {
      await fs.mkdir(hostDir, { recursive: true }).catch(() => {})
    }

    // Remove any stopped (or adopted, unverified) container with the same name
    // before recreating. "Never rebound" is enforced here and nowhere else:
    // there is no path that hands an existing container new binds.
    // Gated on the removal LANDING, as the other three removal paths are: a
    // failed `rm` on a container that is up and holding a preview would
    // otherwise zero that hold while the dev server is still serving.
    const removed = await docker(['rm', '-f', containerName]).then(() => true).catch(() => false)
    if (removed) this.forgetWhatDiedWithIt(containerName)
    this.containerIds.delete(containerName)

    // ADR-0066: one network per agent container, whose only other member is
    // the site — see containerNetwork.ts's own doc comment. Marked `pending`
    // until the container below is up, released in `finally` so a sweep
    // racing this start never takes a network with nothing attached to it yet.
    const network = await ensureAgentNetwork(containerName)
    let startedId = ''
    try {
      logger.info(`[container] starting ${containerName} (storage: ${mounts.boundary.hostDir}→${mounts.boundary.containerDir})`)
      const { args, clientEnv } = buildContainerRunCommand(key, ctx, containerName, mounts, network, limits)
      ;({ stdout: startedId } = await docker(args, clientEnv))
    } finally {
      releaseAgentNetwork(containerName)
    }
    const id = startedId.trim()
    if (/^[0-9a-f]{12,64}$/.test(id)) this.containerIds.set(containerName, id)
    const started = this.getOrCreateState(containerName)
    started.mountSig = sig
    delete started.draining
    logger.info(`[container] started ${containerName}`)
  }

  /**
   * Remove containers for storage locations that no longer exist on this site.
   * Called at server startup with the set of live boundaries (`<ownerType>:<ownerId>`,
   * storageBoundaries.ts); a live boundary's containers are left alone
   * (ensureRunning() manages them). Delegates to ContainerLifecycle
   * (containerLifecycle.ts, split out in phase 5d-2) — see that class's own doc
   * comment for the two-branch sweep and the label-ordering pin ("a live
   * boundary's container, listed by both branches, is swept by neither",
   * __tests__/containerLifecycle.test.ts).
   */
  async removeOrphans(activeBoundaries: Set<string>): Promise<number> {
    return this.lifecycle.removeOrphans(activeBoundaries)
  }

  /**
   * ADR-0049: idle teardown is mandatory, not an optimisation — a boundary
   * otherwise leaves a permanently-running container. Delegates to
   * ContainerLifecycle (containerLifecycle.ts, split out in phase 5d-2) — see that
   * class's own doc comment for the adoption/grace-floor/stopping-handshake
   * behaviour.
   */
  async sweepIdle(idleMs: number): Promise<void> {
    return this.lifecycle.sweepIdle(idleMs)
  }

  /**
   * Remove every container this agent last started. Label-filtered by both agent
   * handle AND this install's compose project, so a daemon shared by two
   * installs can't have one stop the other's containers merely because they
   * share an agent handle. Used when an agent is deleted.
   *
   * Under ADR-0057 a container belongs to a storage location, not to an agent,
   * so `<namespace>.agent` names the run that last (re)created it rather than
   * everything that has run in it. Removing those containers is therefore wider
   * than "this agent's work" and narrower than "everywhere this agent ran": a
   * boundary whose container this agent last started loses it and recreates it
   * on its next run, which costs a start and no data.
   *
   * Lists by NAME, not id — so each removed container's state entry can be
   * pruned, matching containerStates' "pruned on removal" contract.
   *
   * A container with a live run (activeRuns > 0) is SKIPPED, not force-removed —
   * `rm -f`-ing a container an in-flight run is still exec-ing into would kill that
   * run out from under it. Returns `{ allRemoved: false }` whenever a container was
   * skipped (or a removal itself failed), so a caller whose action depends on every
   * container actually being gone knows to leave its own follow-up pending rather
   * than treating a partial sweep as complete. The skipped container is left for a
   * later stopAgent/sweepIdle pass,
   * once its run has drained and activeRuns drops back to 0.
   */
  async stopAgent(handle: string): Promise<{ allRemoved: boolean }> {
    logger.info(`[container] stopping every container last started by ${handle}`)
    try {
      const project = resolveComposeProjectName()
      const { stdout } = await docker([
        'ps', '-a',
        '--filter', `label=${labelKey('agent')}=${handle}`,
        '--filter', `label=com.docker.compose.project=${project}`,
        '--format', '{{.Names}}',
      ])
      const names = stdout.trim().split('\n').filter(Boolean)
      let allRemoved = true
      for (const name of names) {
        const state = this.containerStates.get(name)
        if (state && state.activeRuns > 0) {
          logger.info(`[container] skipping ${name} — has a live run, leaving it in place`)
          allRemoved = false
          continue
        }
        // The third removal path, reading the hold for the reason the two
        // sweeps do: stopping an agent is no reason to end a watched preview.
        if (this.lifecycle.hasPreview(name)) {
          logger.info(`[container] skipping ${name} — a preview is serving out of it, leaving it in place`)
          allRemoved = false
          continue
        }
        const ok = await docker(['rm', '-f', name]).then(() => true).catch(() => false)
        if (ok) {
          this.containerStates.delete(name)
          this.forgetWhatDiedWithIt(name)
        } else {
          allRemoved = false
        }
      }
      // A refreshed subscription token, if any of these containers held one,
      // has already been sent to hq at the end of whichever run refreshed it
      // (AgentEngine.ts's finally, against the run's grant in
      // subscriptionLogins.ts) — there is no shared seed left to promote
      // anything onto here.
      return { allRemoved }
    } catch {
      // Docker not available — nothing could be confirmed removed.
      return { allRemoved: false }
    }
  }

  /**
   * Stop and remove every container matching `filter` — a runner, an owner
   * kind, an owner id, ANDed, at least one given — and return how many went.
   * For a person leaving a project or the organisation, or a project being
   * deleted (spec §4). Refuses, removing nothing, while any match still has a
   * run in it: callers stop the runs first. See containerRemoval.ts.
   */
  async removeContainersFor(filter: ContainerRemovalFilter & { runner?: CapabilityRunner }): Promise<number> {
    return removeContainersFor(filter, {
      states: this.containerStates,
      forget: (name) => {
        this.containerStates.delete(name)
        this.containerIds.delete(name)
        this.forgetWhatDiedWithIt(name)
      },
    })
  }
}

export const agentContainerManager = new AgentContainerManager()
