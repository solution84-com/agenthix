/**
 * The live-preview store (live preview spec section 4, *States*): the one writer of a live preview's record. Every
 * change runs in one queue, so a check and the write it allows (one live preview per branch, the site's limit) can
 * never interleave. After each change it tells hq (`livePreview.state`) and its listeners: the apps, the tickets, the
 * guard.
 */
import { LIVE_PREVIEW_EVENTS, type LivePreviewState } from '@agenthix/core'
import { Logger } from '../utils/logger'
import { MAX_RUNS, readLiveLivePreviews, readLivePreview, summaryOf, writeLivePreview, type LivePreviewRow } from './livePreviewRows'

const logger = new Logger('livePreviews')

let queue: Promise<unknown> = Promise.resolve()

/** Runs `fn` after every change queued before it, and before any queued after. */
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

const listeners = new Set<(row: LivePreviewRow) => void>()

export function onLivePreviewChange(listener: (row: LivePreviewRow) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export type StoreDeps = { tell: (row: LivePreviewRow) => void }

/** hq's line is loaded when first told, so the store sits below it: the line's own modules use the store. */
export const storeDeps: StoreDeps = {
  tell: row => {
    const event = { livePreview: summaryOf(row), at: new Date().toISOString() }
    void import('../hq/hqConnection').then(m => m.hqConnectionManager.sendEvent(LIVE_PREVIEW_EVENTS.state, event))
  },
}

function told(row: LivePreviewRow): void {
  storeDeps.tell(row)
  for (const listener of listeners) {
    try {
      listener(row)
    } catch (err) {
      logger.warn(`A live-preview listener failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/** Writes `row` and tells hq and the listeners. Call inside `serial`. */
export async function saveLivePreview(row: LivePreviewRow): Promise<LivePreviewRow> {
  await writeLivePreview(row)
  told(row)
  return row
}

/** Reads the row, lets `change` decide, and writes what it returns (null writes nothing), all inside the queue. */
export function changeLivePreview<T>(
  id: string,
  change: (row: LivePreviewRow | null) => Promise<{ row: LivePreviewRow | null; result: T }> | { row: LivePreviewRow | null; result: T },
): Promise<T> {
  return serial(async () => {
    const { row, result } = await change(await readLivePreview(id))
    if (row) await saveLivePreview(row)
    return result
  })
}

export const livePreviewRow = (id: string): Promise<LivePreviewRow | null> => readLivePreview(id)
export const liveLivePreviews = (): Promise<LivePreviewRow[]> => readLiveLivePreviews()

/** The live preview open on this branch of this workspace here, if any. */
export async function liveOnBranch(workspaceId: string, branch: string): Promise<LivePreviewRow | null> {
  return (await readLiveLivePreviews()).find(r => r.workspaceId === workspaceId && r.branch === branch) ?? null
}

/** Moves the state; a stopped live preview stays stopped. Null when there is none, or nothing changed. */
export function moveState(id: string, next: (row: LivePreviewRow) => LivePreviewState | null): Promise<LivePreviewRow | null> {
  return changeLivePreview(id, row => {
    if (!row || row.state.state === 'stopped') return { row: null, result: null }
    const state = next(row)
    if (!state) return { row: null, result: null }
    const moved = { ...row, state }
    return { row: moved, result: moved }
  })
}

/** A run on the live preview's branch here: remembered for `noRun` and for the guard. */
export function trackRun(id: string, runId: string): Promise<null> {
  return changeLivePreview(id, row => ({
    row: row && row.state.state !== 'stopped' && !row.runs.includes(runId) ? { ...row, runs: [...row.runs, runId].slice(-MAX_RUNS) } : null,
    result: null,
  }))
}
