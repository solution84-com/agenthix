/**
 * Whether an upgrade came up healthy (spec §11, the board's *An upgrade, running and rolled back*): HQ answers its
 * control socket as the new version, and the site connects to HQ. On a machine without HQ, the site says itself
 * whether it is connected. Returns what was wrong, in words, or null.
 *
 * Only what was started as the new version counts: hq-server by the version it answers as, the site by the version
 * its container's environment carries, so a container of the old version with the same name never passes it. A
 * development build's upgrade to images built here has no version to tell them by: `ids` are those images, and
 * hq-server's and the site's containers count only while they run them.
 */
import { installed, type Context } from '../service/context'
import { readSiteReport, siteContainerOf } from '../status/siteControl'
import type { Target } from './rules'
import { isPublishedVersion, type PublishedPart } from '../images/published'

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

/** Whether the site's container was started as `version`; a development build's carries no version, so any is it. */
async function siteRuns(ctx: Context, container: string | null, version: string, image: string | undefined): Promise<boolean> {
  if (image) return !!container && (await ctx.docker.containerImage(container).catch(() => null)) === image
  if (!isPublishedVersion(version)) return true
  const env = container ? await ctx.docker.containerEnv(container).catch(() => null) : null
  return env?.APP_VERSION === version
}

export async function healthProblem(
  ctx: Context, target: Target, version: string, ids?: Partial<Record<PublishedPart, string>>,
): Promise<string | null> {
  const here = installed(ctx)
  if (target === 'hq') {
    const seen: { version: string | null } = { version: null }
    const server = ids?.['hq-server']
    const answered = await within(ctx, ctx.waits.hqMs, async () => {
      if (server && (await ctx.docker.containerImage(ctx.names.container('hq-server')).catch(() => null)) !== server) return null
      const status = await ctx.hqControl.status()
      if (status) seen.version = status.version
      return status?.version === version ? status : null
    })
    if (!answered) {
      return seen.version === null
        ? `hq-server did not answer${server ? ' from the new image' : ''} within ${minutes(ctx.waits.hqMs)}`
        : `HQ answered as version ${seen.version}, not ${version}`
    }
  }
  const name = here.site?.settings.name ?? ctx.machine.name
  const container = here.site ? siteContainerOf(here.site.file) : null
  const seen = { oldSite: false }
  const connected = await within(ctx, ctx.waits.siteMs, async () => {
    if (!(await siteRuns(ctx, container, version, ids?.['site-server']))) {
      seen.oldSite = true
      return null
    }
    seen.oldSite = false
    if (here.hq) return (await ctx.hqControl.status())?.hqSite.state === 'connected' ? true : null
    const report = container ? await readSiteReport(ctx.docker, container).catch(() => null) : null
    return report?.connected ? true : null
  })
  if (connected) return null
  return seen.oldSite
    ? `the site ${name} did not start as ${ids?.['site-server'] ? 'the new image' : version} within ${minutes(ctx.waits.siteMs)}`
    : `the site ${name} did not connect to HQ within ${minutes(ctx.waits.siteMs)}`
}
