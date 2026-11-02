/**
 * How many commit helpers run at once on this site, and reads that share one run.
 *
 * - **A site-wide limit.** Every helper, whatever the workspace, takes one of `HELPER_SLOTS` slots for its life, so a
 *   storm of requests from screens can never start more than a few containers at once. One beyond the limit waits its
 *   turn, in order, for up to half its budget; one still waiting then is refused, having started nothing.
 * - **Identical reads share one run.** A read asked again while the same read is running, or within `READ_SHARE_MS`
 *   of its answer, is given that answer. Any helper that writes a workspace's repository moves that workspace's
 *   generation on, at its start and at its end, so a read never answers from before a write that finished.
 */

/** Commit helpers this site runs at once. */
export const HELPER_SLOTS = 4
/** How long a read's answer is shared after it came. */
export const READ_SHARE_MS = 2_000
const MAX_SHARED = 500

type Waiter = { grant: () => void; timer: ReturnType<typeof setTimeout> }

/** A counting limit with an ordered queue; a waiter that runs out of time is refused, and never holds a slot. */
export class Slots {
  private busy = 0
  private readonly queue: Waiter[] = []

  constructor(readonly limit: number) {}

  get running(): number { return this.busy }
  get waiting(): number { return this.queue.length }

  /** A release function once a slot is free, or null when none came free within `waitMs`. */
  acquire(waitMs: number): Promise<(() => void) | null> {
    if (this.busy < this.limit) {
      this.busy++
      return Promise.resolve(this.releaser())
    }
    return new Promise(resolve => {
      const waiter: Waiter = {
        grant: () => { clearTimeout(waiter.timer); resolve(this.releaser()) },
        timer: setTimeout(() => {
          const i = this.queue.indexOf(waiter)
          if (i >= 0) this.queue.splice(i, 1)
          resolve(null)
        }, Math.max(0, waitMs)),
      }
      this.queue.push(waiter)
    })
  }

  private releaser(): () => void {
    let done = false
    return () => {
      if (done) return
      done = true
      const next = this.queue.shift()
      // The slot passes straight to the next waiter, so `busy` never dips below the limit while one waits.
      if (next) next.grant()
      else this.busy--
    }
  }
}

export const helperSlots = new Slots(HELPER_SLOTS)

const generations = new Map<string, number>()

/** A helper is about to write, or has written, the workspace's repository: reads from before it are not shared. */
export function wroteWorkspace(workspaceId: string): void {
  generations.set(workspaceId, (generations.get(workspaceId) ?? 0) + 1)
}

type Shared = { generation: number; promise: Promise<unknown>; answeredAt: number | null }
const shared = new Map<string, Shared>()

/**
 * `work`'s answer, shared with every identical read (`key`) of the same workspace asked while it runs or within
 * `READ_SHARE_MS` of its answer, unless the workspace was written meanwhile. A failure is never shared after it came.
 */
export function sharedRead<T>(workspaceId: string, key: string, work: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const generation = generations.get(workspaceId) ?? 0
  const full = `${workspaceId}\u0000${key}`
  const hit = shared.get(full)
  if (hit && hit.generation === generation && (hit.answeredAt === null || now() - hit.answeredAt < READ_SHARE_MS)) {
    return hit.promise as Promise<T>
  }
  if (shared.size >= MAX_SHARED) prune(now())
  const entry: Shared = { generation, promise: Promise.resolve(), answeredAt: null }
  const promise = work().then(
    value => { entry.answeredAt = now(); return value },
    err => { if (shared.get(full) === entry) shared.delete(full); throw err },
  )
  entry.promise = promise
  shared.set(full, entry)
  return promise
}

function prune(at: number): void {
  for (const [k, e] of shared) if (e.answeredAt !== null && at - e.answeredAt >= READ_SHARE_MS) shared.delete(k)
  // Still full of reads in flight: the oldest go first. They keep running; only their sharing ends.
  while (shared.size >= MAX_SHARED) shared.delete(shared.keys().next().value as string)
}

export function __resetHelperSlotsForTests(): void {
  shared.clear()
  generations.clear()
}
