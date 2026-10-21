/**
 * Whether an upgrade came up healthy (spec §11, the board's *An upgrade, running and rolled back*): HQ answers its
 * control socket as the new version, and the site connects to HQ. On a machine without HQ, the site says itself
 * whether it is connected. Returns what was wrong, in words, or null.
 */
import { installed, type Context } from '../service/context'
import { readSiteReport, siteContainerOf } from '../status/siteControl'
import type { Target } from './rules'

const minutes = (ms: number) => {
  const n = Math.max(1, Math.round(ms / 60_000))
  return n === 1 ? '1 minute' : `${n} minutes`
}

async function within<T>(ctx: Context, limitMs: number, probe: () => Promise<T | null>): Promise<T | null> {
  const until = ctx.now().getTime() + limitMs
  for (;;) {
    const value = await probe()
    if (value !== null) return value
    if (ctx.now().getTime() >= until) return null
    await ctx.sleep(ctx.waits.pollMs)
  }
}

export async function healthProblem(ctx: Context, target: Target, version: string): Promise<string | null> {
  const here = installed(ctx)
  if (target === 'hq') {
    const seen: { version: string | null } = { version: null }
    const answered = await within(ctx, ctx.waits.hqMs, async () => {
      const status = await ctx.hqControl.status()
      if (status) seen.version = status.version
      return status?.version === version ? status : null
    })
    if (!answered) {
      return seen.version === null
        ? `hq-server did not answer within ${minutes(ctx.waits.hqMs)}`
        : `HQ answered as version ${seen.version}, not ${version}`
    }
  }
  const name = here.site?.settings.name ?? ctx.machine.name
  const connected = await within(ctx, ctx.waits.siteMs, async () => {
    if (here.hq) return (await ctx.hqControl.status())?.hqSite.state === 'connected' ? true : null
    const container = here.site ? siteContainerOf(here.site.file) : null
    const report = container ? await readSiteReport(ctx.docker, container).catch(() => null) : null
    return report?.connected ? true : null
  })
  return connected ? null : `the site ${name} did not connect to HQ within ${minutes(ctx.waits.siteMs)}`
}
