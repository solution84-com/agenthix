/**
 * A site restored to an earlier night on its own machine (spec §12), from the Fleet Console's *Restore…*: the same
 * site, so it keeps its name, its credential at HQ, its settings and its secrets, and only its database and
 * workspaces go back to that night, run by the version the backup was taken from. What is there now was backed up
 * first (`restore.ts`), so the restore can be undone the same way.
 */
import fs from 'node:fs'
import type { Progress } from '../sockets/lineServer'
import { checkImages, fetchImages } from '../images/images'
import { POSTGRES_IMAGE } from '../images/published'
import { installed, type Context, type StoredSite } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { startDatabases, startTarget, stopTarget, writeProjects } from '../upgrades/rollback'
import { eachPart, PART, sources } from './parts'
import type { Checked } from './restoreSource'
import { RESTORED_NOTE } from './restore'

export type SiteInPlaceResult = { siteName: string; night: string; takenAt: string; holds: ('hq' | 'site')[] }

/** Whether a site-only backup is of the site that runs here now; throws in words, before anything changes. */
export function checkSameSite(ctx: Context, { header, manifest }: Pick<Checked, 'header' | 'manifest'>): void {
  const site = installed(ctx).site
  if (!site) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}, so there is nothing to restore to an earlier night.`)
  if (manifest.site.installedAt !== site.settings.installedAt) {
    throw new Refusal('conflict', `This backup, taken ${header.takenAt}, is of a site that ran on ${ctx.machine.name} before the one there now, so it is not restored over it. Nothing was changed.`)
  }
}

export async function restoreSiteInPlace(ctx: Context, { header, manifest, records }: Checked, progress: (p: Progress) => void): Promise<SiteInPlaceResult> {
  const step = async <T>(name: string, work: () => Promise<T>, outcome = 'done'): Promise<T> => {
    progress({ event: 'step', step: name })
    const value = await work()
    progress({ event: 'stepDone', outcome })
    return value
  }
  let stopped = false
  try {
    const now = installed(ctx).site
    if (!now) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}, so there is nothing to restore to an earlier night.`)
    if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
    const paths = await ctx.machinePaths()
    if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot restore.')
    const { pins } = await step('Checking the images are signed', async () => {
      const checked = await checkImages(ctx, [{ part: 'site-server', version: manifest.site.version }, { part: 'agent', version: manifest.site.version }])
      await fetchImages(ctx, [POSTGRES_IMAGE, checked.pins['site-server']!, checked.pins.agent!])
      return checked
    }, 'passes')
    await step(`Stopping the site ${now.settings.name}`, () => stopTarget(ctx, 'site'))
    stopped = true
    // The same site: its own settings and credential, at the version the backup was taken from.
    const site: StoredSite = { ...now.settings, version: manifest.site.version, images: { 'site-server': pins['site-server'], agent: pins.agent } }
    await writeProjects(ctx, null, site, paths)
    await step("Starting the site's database", () => startDatabases(ctx, 'site'))
    const src = sources(ctx.names, paths)
    await eachPart(records, async (name, bytes) => {
      if (name === PART.siteDatabase) await step("Restoring the site's database", () => ctx.backupIO.restoreDatabase(src[name].container, src[name].database, bytes))
      else if (name === PART.siteData) await step("Restoring the site's workspaces", () => ctx.backupIO.writeFolder(src[name], bytes))
    })
    ctx.state.folder('site', 'data')
    fs.writeFileSync(ctx.state.path('site', 'data', RESTORED_NOTE), `${JSON.stringify({ night: header.night, takenAt: header.takenAt })}\n`, { mode: 0o644 })
    await step(`Starting the site ${site.name}`, () => startTarget(ctx, 'site'), 'running')
    return { siteName: site.name, night: header.night, takenAt: header.takenAt, holds: header.holds }
  } catch (err) {
    await records.return(undefined)
    const why = err instanceof Error ? err.message : String(err)
    if (!stopped) throw err instanceof Refusal ? err : new Refusal('failed', `Not restored: ${why} Nothing was changed.`)
    throw new Refusal('failed', `The restore stopped partway: ${why} The backup taken just before it is on ${ctx.machine.name}: restore that one to go back to how the site was. See how the machine is: ${cmd('status')}`)
  }
}
