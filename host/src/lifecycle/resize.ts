/**
 * A resize Cloud does (pre-release spec B10): `resize.prepare` pauses runs and stops what runs here, by the path a
 * suspension takes, so HQ tells people as for any scheduled change; `resize.finish` starts it again. That a resize is
 * under way is written down, and so is the suspension, so a restart of the host service leaves runs paused until
 * `resize.finish`: nothing here starts the services by itself.
 */
import type { HostTarget } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import type { CloudOnlyHandler } from '../cloud/handlers'
import { runNow } from './changes'
import { suspended } from './suspend'

const FILE = 'resize.json'

type UnderWay = {
  startedAt: string
  /** What the resize suspended; null when nothing runs here. */
  target: HostTarget | null
  /** Whether a person had suspended it already, so the resize leaves it suspended at the end. */
  alreadySuspended: boolean
}

function underWay(ctx: Context): UnderWay | null {
  const v = ctx.state.readJson(FILE) as Partial<UnderWay> | null
  if (!v || typeof v.startedAt !== 'string') return null
  return { startedAt: v.startedAt, target: v.target === 'hq' || v.target === 'site' ? v.target : null, alreadySuspended: v.alreadySuspended === true }
}

export const resizeUnderWay = (ctx: Context): boolean => underWay(ctx) !== null

const BY = { kind: 'cloud' } as const

export async function resizePrepare(ctx: Context): Promise<{ state: 'paused' }> {
  const here = installed(ctx)
  const held = underWay(ctx)
  const target: HostTarget | null = held ? held.target : here.hq ? 'hq' : here.site ? 'site' : null
  const already = held ? held.alreadySuspended : !!target && !!(suspended(ctx)[target] || (target === 'site' && suspended(ctx).hq))
  // Written first: a restart partway through still leaves a resize under way, and asking again carries it on.
  if (!held) ctx.state.writeJson([FILE], { startedAt: ctx.now().toISOString(), target, alreadySuspended: already } satisfies UnderWay)
  if (target && !already && !suspended(ctx)[target]) {
    try {
      await runNow(ctx, { op: 'suspend', target }, BY, () => {})
    } catch (err) {
      if (!held) ctx.state.writeJson([FILE], null)
      throw err
    }
  }
  return { state: 'paused' }
}

export async function resizeFinish(ctx: Context): Promise<{ state: 'started' }> {
  const held = underWay(ctx)
  if (!held) throw new Refusal('conflict', 'No resize is under way, so there is nothing to start again.')
  if (held.target && !held.alreadySuspended && suspended(ctx)[held.target]) {
    await runNow(ctx, { op: 'resume', target: held.target }, BY, () => {})
  }
  ctx.state.writeJson([FILE], null)
  return { state: 'started' }
}

const noFields = <O extends 'resize.prepare' | 'resize.finish'>(op: O) => (r: Record<string, unknown>): { op: O } => {
  if (Object.keys(r).some(k => k !== 'op')) throw new Refusal('malformed', 'This request takes nothing but its name.')
  return { op }
}

export const cloudResizePrepare: CloudOnlyHandler<'resize.prepare'> = { parse: noFields('resize.prepare'), run: ctx => resizePrepare(ctx) }
export const cloudResizeFinish: CloudOnlyHandler<'resize.finish'> = { parse: noFields('resize.finish'), run: ctx => resizeFinish(ctx) }
