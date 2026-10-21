/**
 * How an erased site's machine knows HQ heard it has gone (host-management spec §15). HQ hears of a change on a
 * site's machine only from the site, which reads the notices with the machine's figures and passes them up its
 * channel. So before the site is taken down, the erase waits for the site, while connected to HQ, to read the
 * figures once after the erase's notice was made.
 */
import { installed, type Context } from '../service/context'
import { readSiteReport, siteContainerOf } from '../status/siteControl'

/** Longer than the site's figures refresh (30 seconds), so one read falls inside it. */
export const TOLD_WAIT_MS = 45_000
const POLL_MS = 1_000

const lastRead = new Map<string, number>()

/** The figures socket calls this on every read. */
export function noteFiguresRead(ctx: Context): void {
  lastRead.set(ctx.state.root, ctx.now().getTime())
}

/** Whether HQ was told: the site is connected and read the figures at or after `since`. */
export async function waitForSiteToTellHq(ctx: Context, since: Date): Promise<boolean> {
  const site = installed(ctx).site
  const container = site ? siteContainerOf(site.file) : null
  const report = container ? await readSiteReport(ctx.docker, container).catch(() => null) : null
  if (!report?.connected) return false
  const until = since.getTime() + TOLD_WAIT_MS
  for (;;) {
    if ((lastRead.get(ctx.state.root) ?? 0) >= since.getTime()) return true
    if (ctx.now().getTime() >= until) return false
    await ctx.sleep(POLL_MS)
  }
}
