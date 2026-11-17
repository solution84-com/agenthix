/**
 * Suspend and resume (host-management spec §15, diagram 9): suspending stops HQ or the site and keeps everything —
 * its data, its backups and its credentials; resuming starts it again. Suspending HQ stops its site with it, since
 * the site carries HQ on HQ's machine. What is suspended is recorded, so `status` can tell a suspension from a stop.
 */
import type { HostTarget } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { listScheduled } from '../scheduled/scheduler'

const FILE = 'suspended.json'

/** When each was suspended (ISO); absent when it is not. */
export type Suspended = { hq?: string; site?: string }

export function suspended(ctx: Context): Suspended {
  const v = ctx.state.readJson(FILE) as Suspended | null
  return {
    ...(typeof v?.hq === 'string' ? { hq: v.hq } : {}),
    ...(typeof v?.site === 'string' ? { site: v.site } : {}),
  }
}

/** Whether anything here is suspended: a backup holds HQ and the site together, so it waits for both. */
export const anySuspended = (ctx: Context): boolean => { const s = suspended(ctx); return !!(s.hq || s.site) }

function record(ctx: Context, value: Suspended): void {
  ctx.state.writeJson([FILE], value)
}

/** Forgets every suspension: after an erase, nothing is left to resume. */
export function forgetSuspended(ctx: Context): void {
  record(ctx, {})
}

const name = (target: HostTarget) => (target === 'hq' ? 'HQ' : 'The site')

function present(ctx: Context, target: HostTarget) {
  const here = installed(ctx)
  const found = here[target]
  if (!found) {
    throw new Refusal('not_installed', target === 'hq'
      ? `No HQ here: ${ctx.machine.name} runs no HQ.`
      : `No site runs on ${ctx.machine.name}.`)
  }
  return here
}

export function suspendCheck(ctx: Context, target: HostTarget): void {
  present(ctx, target)
  const s = suspended(ctx)
  if (s[target] || (target === 'site' && s.hq)) {
    throw new Refusal('conflict', `${name(target)} is already suspended; nothing is lost. To start it again: ${cmd(`${s.hq ? 'hq' : target} resume`)}`)
  }
}

export function resumeCheck(ctx: Context, target: HostTarget): void {
  present(ctx, target)
  const s = suspended(ctx)
  // A resume may be set for after a suspension that is itself still ahead.
  const suspendAhead = listScheduled(ctx).some(c => c.kind === 'suspend' && c.target === target && c.state !== 'running')
  if (!s[target] && !suspendAhead) {
    throw new Refusal('conflict', target === 'site' && s.hq
      ? `The site here is suspended with HQ. To start both: ${cmd('hq resume')}`
      : `${name(target)} is not suspended, so there is nothing to resume. To see how it is: ${cmd('status')}`)
  }
}

export async function suspend(ctx: Context, target: HostTarget): Promise<void> {
  const here = present(ctx, target)
  if (here.site) await ctx.docker.stopSite(here.site, ctx.names.agentsProject)
  if (target === 'hq' && here.hq) await ctx.docker.composeStop(here.hq.project, here.hq.file)
  record(ctx, { ...suspended(ctx), [target]: ctx.now().toISOString() })
}

export async function resume(ctx: Context, target: HostTarget): Promise<void> {
  const here = present(ctx, target)
  if (target === 'hq' && here.hq) await ctx.docker.composeUp(here.hq.project, here.hq.file)
  if (here.site) await ctx.docker.composeUp(here.site.project, here.site.file)
  const next = suspended(ctx)
  delete next[target]
  if (target === 'hq') delete next.site
  record(ctx, next)
}
