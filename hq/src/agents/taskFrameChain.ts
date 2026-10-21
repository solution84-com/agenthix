/**
 * Minimal per-taskId promise chain. hq no longer has `runQueue.ts`'s
 * `KeyedAsyncQueue` — it moved with the execution runtime (plan 5d-2) — so
 * this inlines the same pattern, scoped to `taskId`: two `run.status` frames
 * for the SAME task are always processed in the order they arrive, while
 * frames for different tasks interleave freely. `handleSiteEvent`
 * (siteEventHandler.ts) itself does not serialize across frames — its own
 * doc comment says so explicitly — so this is the only place the
 * task-machine's read-modify-write is actually made safe. The revoked-site
 * sweep writes through it too, so its writes and a late frame never interleave.
 */
const taskChains = new Map<string, Promise<void>>()

export function enqueueForTask(taskId: string, fn: () => Promise<void>): Promise<void> {
  const prev = taskChains.get(taskId) ?? Promise.resolve()
  // Run `fn` regardless of whether the previous link in the chain settled or
  // rejected — one frame's failure must never stall every later frame for
  // the same task.
  const next = prev.then(fn, fn)
  const stored = next.catch(() => undefined)
  taskChains.set(taskId, stored)
  // Cleanup (finding 6, quality review): without this, taskChains never
  // shrinks — every taskId that ever got a status frame keeps a settled
  // promise pinned in the map forever. Identity-guarded: only delete the
  // entry if IT is still the one this link stored — a later `enqueueForTask`
  // call for the same taskId (queued while this one was in flight) will have
  // already overwritten it with its own `stored` promise, and that later
  // link's own `.finally` is what must delete it instead.
  stored.finally(() => {
    if (taskChains.get(taskId) === stored) taskChains.delete(taskId)
  })
  return next
}
