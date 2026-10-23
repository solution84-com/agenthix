/**
 * Putting an upgrade back (spec §11): the previous images, which are still on the machine, fixed by the digests
 * they ran as — so going back needs no network — and the databases and folders the upgrade touched, from the backup
 * taken just before it, since a new version may have changed its database as it started.
 */
import { composeJson, hqProject, type MachinePaths } from '../compose/projects'
import { siteComposeProject } from '../install/siteCompose'
import { installed, type Context, type StoredHq, type StoredSite } from '../service/context'
import { installSecrets } from '../state/secrets'
import { BackupStore } from '../backups/store'
import { openChecked } from '../backups/restoreSource'
import { eachPart, PART, sources } from '../backups/parts'
import type { UnderWay } from './settings'
import { installSubnets } from '../compose/subnets'
import { installationOf } from '../state/installation'

/** Writes HQ's and the site's settings and compose projects as given; HQ's only when it is given. */
export async function writeProjects(ctx: Context, hq: StoredHq | null, site: StoredSite, paths: MachinePaths): Promise<void> {
  const secrets = installSecrets(ctx.state)
  const subnets = await installSubnets(ctx)
  if (hq) {
    ctx.state.writeJson(['hq', 'settings.json'], hq)
    ctx.state.writePrivate(['hq', 'compose.json'], composeJson(hqProject(ctx.names, hq, secrets, ctx.machine.name, subnets, installationOf(ctx.state))))
  }
  ctx.state.writeJson(['site', 'settings.json'], site)
  ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site, secrets, paths, subnets)))
}

/** Stops what the upgrade switches: the site, and HQ too when it is HQ's upgrade. */
export async function stopTarget(ctx: Context, target: UnderWay['target']): Promise<void> {
  const here = installed(ctx)
  if (here.site) await ctx.docker.composeStop(here.site.project, here.site.file)
  if (target === 'hq' && here.hq) await ctx.docker.composeStop(here.hq.project, here.hq.file)
}

/** Starts what the upgrade switches, HQ first so its site finds it. */
export async function startTarget(ctx: Context, target: UnderWay['target']): Promise<void> {
  const here = installed(ctx)
  if (target === 'hq' && here.hq) await ctx.docker.composeUp(here.hq.project, here.hq.file)
  if (here.site) await ctx.docker.composeUp(here.site.project, here.site.file)
}

/** Starts only the databases of what the upgrade switches, for a backup to be read from or written into. */
export async function startDatabases(ctx: Context, target: UnderWay['target']): Promise<void> {
  const here = installed(ctx)
  if (target === 'hq' && here.hq) await ctx.backupIO.startServices(here.hq.project, here.hq.file, ['hq-db'])
  if (here.site) await ctx.backupIO.startServices(here.site.project, here.site.file, ['site-db'])
}

export async function putBack(ctx: Context, u: UnderWay): Promise<void> {
  const paths = await ctx.machinePaths()
  if (!paths) throw new Error('the host service cannot find its state folder on this machine')
  const found = await new BackupStore(ctx.state).find(u.backupId)
  if (!found) throw new Error('the backup taken before the upgrade is no longer on this machine')
  await stopTarget(ctx, u.target)
  await writeProjects(ctx, u.target === 'hq' ? u.hq : null, u.site, paths)
  await startDatabases(ctx, u.target)
  const { records } = await openChecked(ctx, { kind: 'machine', name: found.name })
  const src = sources(ctx.names, paths)
  const wanted = new Set<string>(u.target === 'hq'
    ? [PART.hqDatabase, PART.hqStorage, PART.siteDatabase, PART.siteData]
    : [PART.siteDatabase, PART.siteData])
  try {
    await eachPart(records, async (name, bytes) => {
      if (!wanted.has(name)) return
      if (name === PART.hqDatabase || name === PART.siteDatabase) {
        await ctx.backupIO.restoreDatabase(src[name].container, src[name].database, bytes)
      } else {
        await ctx.backupIO.writeFolder(src[name as typeof PART.hqStorage | typeof PART.siteData], bytes)
      }
    })
  } finally {
    await records.return(undefined)
  }
  await startTarget(ctx, u.target)
}
