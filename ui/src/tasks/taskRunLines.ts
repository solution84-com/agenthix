import type { SessionRunInfo } from './sessionRuns'
import { durationText } from './taskGroups'

export type RunTone = 'live' | 'done' | 'failed' | 'muted' | 'needs'

export interface RunLineWords {
  /** "Run 2", by the number HQ stored. */
  title: string
  /** What it did or is doing. */
  what: string
  /** "by you · 6 Nov, 07:54 · 3 min"; a live one reads "since 09:11". */
  facts: string
  tone: RunTone
  live: boolean
}

const firstLine = (text: string) => text.trim().split('\n').find(l => l.trim())?.trim() ?? ''

const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

/** "07:54" today, "6 Nov, 07:54" another day this year, "6 Nov 2025, 07:54" before. */
export function whenText(at: string | Date, now: Date): string {
  const d = new Date(at)
  if (d.toDateString() === now.toDateString()) return clock(d)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
  return `${day}, ${clock(d)}`
}

/** Who started it, as the line names them: "by you", "on schedule", "by automation · for Avery". */
function starter(startedBy: string | null | undefined): string | null {
  if (!startedBy) return null
  return startedBy.startsWith('started ') ? startedBy.slice('started '.length) : startedBy
}

export const runTitle = (run: Pick<SessionRunInfo, 'number'>) => (run.number ? `Run ${run.number}` : 'Run')

/**
 * One run of a task folded to a line (T0, the Runs tab): its stored number, what it did or is doing, who started
 * it, when, and how long it took. `doing` is what the live run reports now.
 */
export function runLineWords(run: SessionRunInfo, opts: {
  now: Date
  waiting?: boolean
  /** The waiting run's line for someone who may not answer it: who can. Left out, "Waiting for your okay". */
  waitingLine?: string
  doing?: string | null
}): RunLineWords {
  const live = run.status === 'RUNNING' || run.status === 'PENDING'
  const started = new Date(run.createdAt)
  const took = durationText((run.endedAt ? new Date(run.endedAt) : opts.now).getTime() - started.getTime())
  const by = starter(run.startedBy)
  const facts = [by, live ? `since ${whenText(started, opts.now)}` : whenText(started, opts.now), run.status === 'PENDING' ? null : took]
    .filter(Boolean).join(' · ')
  const title = runTitle(run)
  if (opts.waiting) return { title, what: opts.waitingLine ?? 'Waiting for your okay', facts, tone: 'needs', live }
  if (run.status === 'PENDING') return { title, what: 'Waiting to start', facts, tone: 'muted', live }
  if (run.status === 'RUNNING') return { title, what: opts.doing?.trim() || 'Working…', facts, tone: 'live', live }
  if (run.status === 'FAILED') {
    const why = run.error ? firstLine(run.error) : ''
    return { title, what: why ? `Failed · ${why}` : 'Failed', facts, tone: 'failed', live }
  }
  if (run.status === 'CANCELLED') return { title, what: 'Stopped', facts, tone: 'muted', live }
  const said = run.result ? firstLine(run.result) : ''
  return { title, what: said || 'Finished without a result', facts, tone: 'done', live }
}
