/**
 * Reading a conversation's record in order (every screen reviewed, *What a
 * conversation shows*).
 *
 * A row is written when its thing happened — a message when it was sent, a
 * tool line when the call was made — so a message sent while a reply was
 * still being written is older than the end of that reply. Read by time
 * alone, the waiting message would land inside the reply's run. A
 * conversation's runs go one after another, so the record is read run by
 * run: each run's rows together, the runs in the order they began.
 */
import type { RunFailedDetail, TranscriptEntryKind, TranscriptRow } from './transcript.js'

type Orderable = Pick<TranscriptRow, 'role' | 'createdAt'> & Partial<Pick<TranscriptRow, 'runId' | 'kind'>>

const ENDINGS: ReadonlySet<TranscriptEntryKind> = new Set(['RUN_FAILED', 'RUN_STOPPED', 'APPROVAL_REQUESTED', 'CONTEXT_SUMMARISED'])

function rank(e: Orderable): number {
  if (e.role === 'USER') return 0
  if (e.role === 'ASSISTANT') return 2
  return e.kind && ENDINGS.has(e.kind) ? 3 : 1
}

/** Each run's rows together, the runs in the order they began; a row with no run stands at its own time. */
export function orderTranscript<T extends Orderable>(entries: T[]): T[] {
  const groups = new Map<string, { key: number; rows: T[] }>()
  entries.forEach((e, i) => {
    const id = e.runId ? `run:${e.runId}` : `row:${i}`
    const at = Date.parse(e.createdAt)
    const group = groups.get(id)
    if (group) {
      group.rows.push(e)
      group.key = Math.min(group.key, at)
    } else {
      groups.set(id, { key: at, rows: [e] })
    }
  })
  return [...groups.values()]
    .sort((a, b) => a.key - b.key)
    .flatMap(g => g.rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || rank(a) - rank(b)))
}

type Readable = Orderable & Pick<TranscriptRow, 'content'> & Partial<Pick<TranscriptRow, 'detail' | 'runStatus'>>

/** Rows that say nothing about whether the latest reply failed: a run's steps, and the runtime summarising. */
function isStep(e: Readable): boolean {
  return e.role === 'TOOL' || (e.role === 'SYSTEM' && (e.kind === 'THOUGHT' || e.kind === 'CONTEXT_SUMMARISED' || !e.kind))
}

export type LatestFailure = {
  /** The failed run. */
  runId: string | null
  reason: string
  /** The message Try again sends again: the person's last message before the failure. */
  message: string
}

/**
 * The latest reply, when it is a failure — the only time Try again is
 * offered, so there is never more than one. Null once anything newer has
 * been said: a reply, a message, a stop or an approval asked. `entries` are
 * in reading order (`orderTranscript`).
 */
export function latestFailure<T extends Readable>(entries: T[]): LatestFailure | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (isStep(e)) continue
    if (e.role !== 'SYSTEM' || e.kind !== 'RUN_FAILED') return null
    const message = entries.slice(0, i).reverse().find(m => m.role === 'USER')
    if (!message) return null
    return { runId: e.runId ?? null, reason: (e.detail as RunFailedDetail | null)?.reason ?? '', message: message.content }
  }
  return null
}

/** A person's message still waiting behind a running reply. */
export function isWaitingMessage(e: Pick<TranscriptRow, 'role'> & Partial<Pick<TranscriptRow, 'runStatus'>>): boolean {
  return e.role === 'USER' && e.runStatus === 'PENDING'
}

/** How many replies the conversation has, and how many of them failed — for its header's popup. */
export function replyCounts(entries: Array<Pick<TranscriptRow, 'role'> & Partial<Pick<TranscriptRow, 'kind'>>>): { replies: number; failed: number } {
  let replies = 0
  let failed = 0
  for (const e of entries) {
    if (e.role === 'ASSISTANT') replies++
    if (e.role === 'SYSTEM' && e.kind === 'RUN_FAILED') { replies++; failed++ }
  }
  return { replies, failed }
}
