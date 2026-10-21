/**
 * Which runs the tool gate may still allow calls for.
 *
 * A harness can ask for a decision and then be stopped while it waits. OpenCode
 * does not cancel a plugin hook that is still waiting, so a call the site
 * allowed after its turn was aborted would still run, unrecorded (spec,
 * "Per-call authorization gate", item 3). Stopping a run here answers every
 * decision still pending for it with a refusal at once, and refuses every later
 * one, so a caller that stops the run BEFORE it aborts the harness knows no call
 * of that run can be allowed afterwards.
 *
 * Kept in memory: a run does not survive a restart of this process, and neither
 * does a harness waiting on it. A stopped run's id is kept for a while after it
 * stops, long enough for any decision the harness still sends for it; ids are
 * never reused.
 *
 * A run can also be asked to pause (a scheduled change): the
 * call it is running finishes, and its next decision is refused and pauses the
 * run there (`reachGatePause`).
 */
import type { RunContext } from './types'

const STOPPED_RETENTION_MS = 6 * 60 * 60 * 1000

const stopped = new Map<string, number>()
const waiting = new Map<string, Set<() => void>>()
const contexts = new Map<string, RunContext>()
const pausing = new Map<string, () => void>()

function prune(now: number): void {
  for (const [runId, at] of stopped) {
    if (now - at < STOPPED_RETENTION_MS) break
    stopped.delete(runId)
  }
}

/**
 * The run's turn has ended or been stopped: every decision pending for it is
 * answered with a refusal now, and every later one is refused. Idempotent.
 */
export function stopGateRun(runId: string): void {
  const now = Date.now()
  prune(now)
  contexts.delete(runId)
  pausing.delete(runId)
  if (!stopped.has(runId)) stopped.set(runId, now)
  const pending = waiting.get(runId)
  waiting.delete(runId)
  for (const release of pending ?? []) release()
}

export function gateRunStopped(runId: string): boolean {
  return stopped.has(runId)
}

/**
 * Asks the run to pause at its next tool call: that decision calls `reached`
 * (which stops the run) and is refused. Nothing for a run already stopped.
 */
export function pauseGateRun(runId: string, reached: () => void): void {
  if (!stopped.has(runId)) pausing.set(runId, reached)
}

export function gatePausing(runId: string): boolean {
  return pausing.has(runId)
}

/** The run, asked to pause, has reached a decision: pauses it there, once. False when it was not pausing. */
export function reachGatePause(runId: string): boolean {
  const reached = pausing.get(runId)
  if (!reached) return false
  pausing.delete(runId)
  reached()
  return true
}

/**
 * Makes a running turn's context findable by its run id, for a gate call that
 * arrives from outside this process's call stack (OpenCode's plugin, which
 * names the run only through the conversation's token). A runtime registers
 * the context when its turn starts; `stopGateRun` forgets it. A stopped run is
 * never registered again.
 */
export function registerGateRun(context: RunContext): void {
  if (!stopped.has(context.runId)) contexts.set(context.runId, context)
}

/** The running turn's context, or null for a run that is unknown, ended or stopped. */
export function gateRunContext(runId: string): RunContext | null {
  return stopped.has(runId) ? null : contexts.get(runId) ?? null
}

/**
 * `decision`, unless the run is stopped first, in which case `whenStopped`
 * straight away. `decision` itself carries on; it checks `gateRunStopped`
 * before recording an allowed call, so a decision overtaken by a stop is
 * recorded as refused rather than allowed.
 */
export function untilGateRunStopped<T>(runId: string, decision: Promise<T>, whenStopped: T): Promise<T> {
  if (stopped.has(runId)) return Promise.resolve(whenStopped)
  return new Promise<T>((resolve, reject) => {
    const release = () => resolve(whenStopped)
    let set = waiting.get(runId)
    if (!set) waiting.set(runId, (set = new Set()))
    set.add(release)
    const done = () => {
      const current = waiting.get(runId)
      current?.delete(release)
      if (current?.size === 0) waiting.delete(runId)
    }
    decision.then(v => { done(); resolve(v) }, e => { done(); reject(e) })
  })
}

/** Test seam: forget every stopped run and pending decision. */
export function resetGateRunsForTests(): void {
  stopped.clear()
  waiting.clear()
  contexts.clear()
  pausing.clear()
}
