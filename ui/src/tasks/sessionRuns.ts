import type { TranscriptEntry } from '../sessions/types'

/** One run of a task's session as the transcript divides it (every screen reviewed spec §3). */
export interface SessionRunInfo {
  id: string
  status: string
  createdAt: string | Date
  endedAt: string | Date | null
  /** Who or what started it, when hq recorded it: "Avery", "the column". */
  startedBy?: string | null
}

export interface SessionSegment {
  /** Null for entries older than the first run hq knows of. */
  run: SessionRunInfo | null
  number: number
  start: string | null
  end: string | null
  entries: TranscriptEntry[]
}

const ENDED: Record<string, string> = {
  COMPLETED: 'finished',
  FAILED: 'failed',
  CANCELLED: 'stopped',
}

const clock = (d: string | Date) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

const time = (d: string | Date) => new Date(d).getTime()

/**
 * The transcript cut into its runs, in the order things happened. An entry
 * belongs to the run that was going when it was written (started, not yet
 * ended); one written before any run, or between two, sits under no run, so a
 * run's end divider never comes before a later message.
 */
export function segmentSession(entries: TranscriptEntry[], runs: SessionRunInfo[], waitingRunId: string | null = null): SessionSegment[] {
  const ordered = [...runs].sort((a, b) => time(a.createdAt) - time(b.createdAt))
  const segments: SessionSegment[] = ordered.map((run, i) => {
    const ended = ENDED[run.status]
    return {
      run,
      number: i + 1,
      start: `Run ${i + 1} · ${clock(run.createdAt)}${run.startedBy ? ` · ${run.startedBy}` : ''}`,
      end: run.id === waitingRunId
        ? `Run ${i + 1} waiting for you`
        : ended && run.endedAt ? `Run ${i + 1} ${ended} · ${clock(run.endedAt)}` : null,
      entries: [],
    }
  })
  const between: SessionSegment[] = []
  for (const entry of [...entries].sort((a, b) => time(a.createdAt) - time(b.createdAt))) {
    const at = time(entry.createdAt)
    const home = segments.filter(s => time(s.run!.createdAt) <= at && (!s.run!.endedAt || at <= time(s.run!.endedAt))).pop()
    if (home) { home.entries.push(entry); continue }
    // Entries are in time order, so a gap's entries are contiguous: it closes when a run starts after it.
    const last = between[between.length - 1]
    const runStartedSince = last && segments.some(s => {
      const t = time(s.run!.createdAt)
      return t > time(last.entries[last.entries.length - 1].createdAt) && t <= at
    })
    if (last && !runStartedSince) last.entries.push(entry)
    else between.push({ run: null, number: 0, start: null, end: null, entries: [entry] })
  }
  const startOf = (s: SessionSegment) => (s.run ? time(s.run.createdAt) : time(s.entries[0].createdAt))
  return [...segments, ...between].sort((a, b) => startOf(a) - startOf(b))
}
