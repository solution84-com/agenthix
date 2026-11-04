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

/**
 * Who is watching the change that runs now, and how it ended, one slot for each kind of change on each target, so a
 * resume asked while a suspend runs does not clear the suspend's failure or its watcher. (Two of one kind on one
 * target are not both accepted: the second one's check refuses it.)
 */
const watching = new Map<string, (p: Progress) => void>()
const failures = new Map<string, Refusal>()
const outcomes = new Map<string, EraseOutcome>()

const slot = (ctx: Context, op: LifecycleRequest['op'], target: string) => `${ctx.state.root}|${op}|${target}`
const progressOf = (ctx: Context, op: LifecycleRequest['op'], target: string) => watching.get(slot(ctx, op, target)) ?? (() => {})

/** Keeps a failure's own code and words for `runNow`; the scheduler records it as rolled back either way. */
async function remembered<T>(key: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    failures.set(key, err instanceof Refusal ? err : new Refusal('failed', err instanceof Error ? err.message : String(err)))
    throw err
  }
}

registerScheduledChange('suspend', {
  kind: 'suspend', target: r => r.target, detail: () => null, expectedMinutes: 0,
  check: (ctx, r) => suspendCheck(ctx, r.target),
  run: (ctx, r) => remembered(slot(ctx, 'suspend', r.target), () => suspend(ctx, r.target)),
})
registerScheduledChange('resume', {
  kind: 'resume', target: r => r.target, detail: () => null, expectedMinutes: 0,
  check: (ctx, r) => resumeCheck(ctx, r.target),
  run: (ctx, r) => remembered(slot(ctx, 'resume', r.target), () => resume(ctx, r.target)),
})
registerScheduledChange('erase', {
  kind: 'erase', target: r => r.target, detail: () => null, expectedMinutes: 0, holdsMachine: true,
  check: (ctx, r) => eraseCheck(ctx, r),
  run: (ctx, r, waiting) => remembered(slot(ctx, 'erase', r.target), async () => {
    outcomes.set(slot(ctx, 'erase', r.target), await eraseRun(ctx, r, progressOf(ctx, 'erase', r.target), waiting))
  }),
})

export type RunNowResult = { change: ScheduledChange; erased: EraseOutcome | null }

/** Runs a suspend, resume or erase now: set a second ahead, then run by the scheduler, its steps sent to `progress`. */
export async function runNow(ctx: Context, request: LifecycleRequest, by: ScheduledBy, progress: (p: Progress) => void): Promise<RunNowResult> {
  const key = slot(ctx, request.op, request.target)
  const change = await scheduleChange(ctx, request, new Date(ctx.now().getTime() + 1000).toISOString(), by)
  watching.set(key, progress)
  failures.delete(key)
  outcomes.delete(key)
  try {
    await ctx.sleep(1000)
    for (;;) {
      await tickScheduled(ctx)
      const entry = readStore(ctx.state).entries.find(e => e.change.id === change.id)
      if (!entry) throw new Refusal('failed', 'The change was not kept; nothing was done.')
      if (entry.endedAt) {
        if (entry.change.state === 'done') return { change: entry.change, erased: request.op === 'erase' ? outcomes.get(key) ?? null : null }
        throw failures.get(key) ?? new Refusal('failed', entry.notice?.reason ?? 'It did not complete.')
      }
      // The scheduler's own tick took it first: wait for it to finish.
      await ctx.sleep(500)
    }
  } finally {
    watching.delete(key)
    failures.delete(key)
    outcomes.delete(key)
  }
}
