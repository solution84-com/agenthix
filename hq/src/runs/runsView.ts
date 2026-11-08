/**
 * How a person's runs are grouped and described (spec §6). Pure: the query
 * (`myRuns.ts`) reads the rows, this turns a row into the group it sits in,
 * who started it and the state its second line ends with.
 */

import { plainFailureReason, type MyRunGroup, type RunStarter } from '@agenthix/core'

export type { MyRunGroup, RunStarter } from '@agenthix/core'

export type StarterSource = {
  runStartedBy: string | null
  queuedByUserId: string | null
  queuedByAgentId: string | null
}

export type StarterNames = { users: Map<string, string>; agents: Map<string, string> }

/** Who or what asked for the run to start, from the task's own record (adr-0087). */
export function starterOf(task: StarterSource, names: StarterNames): RunStarter {
  switch (task.runStartedBy) {
    case 'person':
      return { kind: 'person', name: (task.queuedByUserId && names.users.get(task.queuedByUserId)) || null }
    case 'agent':
      return { kind: 'agent', name: (task.queuedByAgentId && names.agents.get(task.queuedByAgentId)) || null }
    case 'schedule':
      return { kind: 'schedule', name: null }
    // Deprecated: the pulse is gone (adr-0175); a run it once started still reads as automation's.
    case 'pulse':
      return { kind: 'automation', name: null }
    default:
      return { kind: 'unknown', name: null }
  }
}

export type LatestRun = {
  status: string
  manifestStatus?: string | null
  error?: string | null
} | null

/** A run still going: not finished, and not stopped waiting for a tool approval. */
export function isRunning(run: LatestRun): boolean {
  return !!run && (run.status === 'RUNNING' || run.status === 'PENDING') && run.manifestStatus !== 'PENDING_APPROVAL'
}

export function wantsApproval(run: LatestRun): boolean {
  return run?.manifestStatus === 'PENDING_APPROVAL'
}

/**
 * A conversation's run has no task, so no run state: pass null. A task's request
 * waits only while the task is blocked: dismissed or run again, it was replaced.
 */
export function groupOf(run: LatestRun, taskRunState: string | null): MyRunGroup {
  if (isRunning(run)) return 'running'
  if (taskRunState === null ? wantsApproval(run) : taskRunState === 'RUN_BLOCKED') return 'waiting'
  if (taskRunState === 'RUN_QUEUED') return 'queued'
  return 'finished'
}

/** A failed run's state starts with this; the panels show the reason after it in plain words. */
export const FAILED_PREFIX = 'failed — '

/** A failed run's error in plain words: the raw text ("exited with code 137") stays on the run, behind Details. */
function failedText(error: string | null | undefined): string {
  const raw = error?.trim()
  return raw ? `${FAILED_PREFIX}${plainFailureReason(raw)}` : 'failed'
}

/**
 * The state a run's second line ends with, in a few words: what a waiting run
 * waits for (a tool request, or the reason the task recorded when it stopped
 * for a person), and how a finished one ended. A running or queued run says
 * nothing here: its time, or its queue note, says it.
 */
export function stateText(group: MyRunGroup, run: LatestRun, task: { runState: string; runStateReason: string | null } | null): string | null {
  const reason = task?.runStateReason?.trim() || null
  if (task?.runState === 'RUN_FAILED' && (group === 'waiting' || group === 'finished')) return reason ? `${FAILED_PREFIX}${reason}` : 'failed'
  if (group === 'waiting') return wantsApproval(run) ? 'wants approval' : reason ?? 'needs you'
  if (group !== 'finished') return null
  switch (run?.status) {
    case 'COMPLETED': return 'done'
    case 'CANCELLED': return 'stopped'
    case 'FAILED': return failedText(run.error)
    default: return 'not started'
  }
}

const RISKY = ['HIGH', 'FLAGGED']

/** The calls rated High or Flagged that a finished run's audit summary counts; null while it has no summary. */
export function riskyCallCount(auditSummary: unknown): number | null {
  const by = (auditSummary as { bySeverity?: Record<string, number> } | null)?.bySeverity
  if (!by) return null
  return RISKY.reduce((n, level) => n + (by[level] ?? 0), 0)
}

type EndedRun = { status: string; error?: string | null }

/**
 * How one run ended, in a few words, from the run itself (a task's own state is the latest run's, not this one's):
 * "completed", "failed — the build broke", "stopped by Ana". A run going or stopped on a request says nothing here.
 */
export function outcomeText(run: EndedRun): string | null {
  switch (run.status) {
    case 'COMPLETED': return 'completed'
    case 'FAILED': return failedText(run.error)
    case 'CANCELLED': {
      const error = run.error?.trim()
      return error && /^(stopped|interrupted) by /i.test(error) ? error.charAt(0).toLowerCase() + error.slice(1) : 'stopped'
    }
    default: return null
  }
}

/**
 * Where a run sits among a person's runs: going now, waiting on a request somebody can still answer (a task's only
 * while it is blocked on it), or finished. A queued task has no run and is filed by the caller.
 */
export function runGroup(run: LatestRun, taskRunState: string | null): MyRunGroup {
  if (isRunning(run)) return 'running'
  if (wantsApproval(run) && (taskRunState === null || taskRunState === 'RUN_BLOCKED')) return 'waiting'
  return 'finished'
}
