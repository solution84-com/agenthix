/**
 * Run bookkeeping for a container, and what happens when a run in it ends.
 *
 * Split out of AgentContainerManager.ts (the limits and the end-of-run work
 * pushed that file against the repo's 500-line convention). This is the seam
 * rather than the drain wait next door, because these are exactly what the
 * launch and the engine call — `markRunStart` from runLaunch.ts once the
 * container is resolved, `markRunEnd` from the end-of-run cleanup. The drain wait is the opposite: it is
 * the recreate path's own guard, reads the same state `ensureRunning` is midway
 * through deciding on, and belongs with it.
 *
 * Shares `containerStates` BY REFERENCE with `AgentContainerManager` and
 * `ContainerLifecycle`, the same way those two already share it: every write any
 * of the three makes is immediately visible to the others.
 */
import { Logger } from '../../server/utils/logger'
import { notifyContainerDestroyed } from './containerDestroyed'
import { positiveNumberEnv } from './containerLimits'
import type { ContainerState } from './containerTypes'

const logger = new Logger('AgentContainerManager')

/** How long the end-of-run work may take before it is abandoned. Default
 *  30 seconds; `AGENT_CONTAINER_ENDRUN_SECONDS` overrides it. Short enough that
 *  a wedge costs one concurrency slot for half a minute rather than forever. */
export function endRunWindowMs(): number {
  return positiveNumberEnv('AGENT_CONTAINER_ENDRUN_SECONDS', 30) * 1000
}

export class ContainerRuns {
  constructor(private containerStates: Map<string, ContainerState>) {}

  private getOrCreateState(name: string): ContainerState {
    let state = this.containerStates.get(name)
    if (!state) {
      state = { activeRuns: 0, lastActivity: Date.now() }
      this.containerStates.set(name, state)
    }
    return state
  }

  markRunStart(name: string): void {
    const state = this.getOrCreateState(name)
    state.activeRuns++
    state.lastActivity = Date.now()
  }

  markRunEnd(name: string): void {
    // A pruned entry means the container is gone (stopAgent/sweepIdle
    // already removed it) — don't resurrect a zombie entry for it.
    const state = this.containerStates.get(name)
    if (!state) return
    state.activeRuns = Math.max(0, state.activeRuns - 1)
    state.lastActivity = Date.now()
  }

  /**
   * A preview has started serving out of this container, or has stopped.
   *
   * Beside the run marks rather than folded into them, because a preview is
   * not a run: it takes no concurrency slot, and What it
   * shares with a run is the one property both sweeps read — that somebody is
   * using this container — so both of these bump `lastActivity` too, and a
   * preview being watched keeps the container warm even while the count sits
   * still.
   */
  markPreviewStart(name: string): void {
    const state = this.getOrCreateState(name)
    state.previewHolds = (state.previewHolds ?? 0) + 1
    state.lastActivity = Date.now()
  }

  markPreviewEnd(name: string): void {
    // A pruned entry means the container is gone, which is what took the
    // preview's process with it — don't resurrect a zombie entry for it.
    const state = this.containerStates.get(name)
    if (!state) return
    state.previewHolds = Math.max(0, (state.previewHolds ?? 0) - 1)
    state.lastActivity = Date.now()
  }

  /**
   * A container of this name has just been destroyed, so everything that was
   * running inside it is gone with it.
   *
   * The hold has to be cleared here rather than left to whoever took it. The
   * state object SURVIVES a recreate — `getOrCreateState` reuses it — so a
   * hold carried across would sit on a brand-new container holding no preview,
   * and all three removal paths read that hold and skip. Nothing would ever
   * clear it again either: the preview registry's own sweep drops entries
   * whose container is gone, and the leaked hold is precisely what keeps this
   * container alive. Only a site restart would.
   *
   * Then it announces, so anything holding a record of what was inside can
   * drop it. Through the seam rather than by calling the preview registry: the
   * preview modules import this runtime, so a call the other way would close a
   * cycle.
   */
  forgetWhatDiedWithIt(name: string): void {
    const state = this.containerStates.get(name)
    if (state) state.previewHolds = 0
    notifyContainerDestroyed(name)
  }
}
