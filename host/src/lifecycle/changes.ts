/**
 * Suspend, resume and erase as scheduled changes (host-management spec §14, §15): each is registered with the
 * scheduler, so one set for later is held, told to members and run like any other. One asked for now goes the same
 * way, set a second ahead and run at once (`runNow`), so members are told as for any scheduled change and the
 * scheduler's record is the only one. While it runs, its steps reach whoever asked.
 */
import type { ChangeRequest, ScheduledBy, ScheduledChange } from '@agenthix/core'
import type { Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { registerScheduledChange } from '../scheduled/registry'
import { scheduleChange, tickScheduled } from '../scheduled/scheduler'
import { readStore } from '../scheduled/store'
import { resume, resumeCheck, suspend, suspendCheck } from './suspend'
import { eraseCheck, eraseRun, type EraseOutcome } from './erase'

export type LifecycleRequest = Extract<ChangeRequest, { op: 'suspend' | 'resume' | 'erase' }>

/** Who is watching the change that runs now on this machine, and how the last one ended. */
const watching = new Map<string, (p: Progress) => void>()
const failures = new Map<string, Refusal>()
const outcomes = new Map<string, EraseOutcome>()

const progressOf = (ctx: Context) => watching.get(ctx.state.root) ?? (() => {})

/** Keeps a failure's own code and words for `runNow`; the scheduler records it as rolled back either way. */
async function remembered<T>(ctx: Context, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    failures.set(ctx.state.root, err instanceof Refusal ? err : new Refusal('failed', err instanceof Error ? err.message : String(err)))
    throw err
  }
}

registerScheduledChange('suspend', {
  kind: 'suspend', target: r => r.target, detail: () => null, expectedMinutes: 0,
  check: (ctx, r) => suspendCheck(ctx, r.target),
  run: (ctx, r) => remembered(ctx, () => suspend(ctx, r.target)),
})
registerScheduledChange('resume', {
  kind: 'resume', target: r => r.target, detail: () => null, expectedMinutes: 0,
  check: (ctx, r) => resumeCheck(ctx, r.target),
  run: (ctx, r) => remembered(ctx, () => resume(ctx, r.target)),
})
registerScheduledChange('erase', {
  kind: 'erase', target: r => r.target, detail: () => null, expectedMinutes: 0, holdsMachine: true,
  check: (ctx, r) => eraseCheck(ctx, r),
  run: (ctx, r, waiting) => remembered(ctx, async () => {
    outcomes.set(ctx.state.root, await eraseRun(ctx, r, progressOf(ctx), waiting))
  }),
})

export type RunNowResult = { change: ScheduledChange; erased: EraseOutcome | null }

/** Runs a suspend, resume or erase now: set a second ahead, then run by the scheduler, its steps sent to `progress`. */
export async function runNow(ctx: Context, request: LifecycleRequest, by: ScheduledBy, progress: (p: Progress) => void): Promise<RunNowResult> {
  const root = ctx.state.root
  const change = await scheduleChange(ctx, request, new Date(ctx.now().getTime() + 1000).toISOString(), by)
  watching.set(root, progress)
  failures.delete(root)
  outcomes.delete(root)
  try {
    await ctx.sleep(1000)
    for (;;) {
      await tickScheduled(ctx)
      const entry = readStore(ctx.state).entries.find(e => e.change.id === change.id)
      if (!entry) throw new Refusal('failed', 'The change was not kept; nothing was done.')
      if (entry.endedAt) {
        if (entry.change.state === 'done') return { change: entry.change, erased: request.op === 'erase' ? outcomes.get(root) ?? null : null }
        throw failures.get(root) ?? new Refusal('failed', entry.notice?.reason ?? 'It did not complete.')
      }
      // The scheduler's own tick took it first: wait for it to finish.
      await ctx.sleep(500)
    }
  } finally {
    watching.delete(root)
  }
}
