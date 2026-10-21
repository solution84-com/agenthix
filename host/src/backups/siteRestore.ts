/**
 * A lost site restored onto this machine from its backup (adr-0119, spec §12): the backup the machine admin chose here
 * and opened with the key they typed here, once a fleet admin confirmed this machine with a code for restoring that
 * site. Before anything is written, HQ is asked whether the site may come back here; then the site's database,
 * workspaces and the master key its stored secrets are sealed with are written back, its credential is renewed at
 * HQ — from then on the backup's credential, and the machine it ran on, are refused — and only then is it started.
 * Whatever fails partway is taken away again, so the machine is left as it was.
 */
import fs from 'node:fs'
import type { JoinRestoreClaim } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { composeJson } from '../compose/projects'
import { checkImages, fetchImages } from '../images/images'
import { POSTGRES_IMAGE } from '../images/published'
import { installed, type Context, type StoredSite } from '../service/context'
import { Refusal } from '../owner/results'
import { installSecrets } from '../state/secrets'
import { makeSiteCredential, siteComposeProject } from '../install/siteCompose'
import type { ConsolePin } from '../link/pin'
import { eachPart, PART, sources } from './parts'
import { RESTORED_NOTE, refuseWhereSomethingRuns } from './restore'
import { openChecked, type Checked, type SourceRef } from './restoreSource'
import { renewAtHq } from './renewal'
import { exclusive } from './take'
import { cmd } from '../cli/words'
import { installSubnets } from '../compose/subnets'

export type RestoredSite = {
  backupId: string
  sizeBytes: number
  /** Named after this machine now. */
  siteName: string
  /** Its name before, on the machine it ran on. */
  formerName: string
  night: string
  takenAt: string
  /** HQ's id for the site, as HQ answered the renewal. */
  executionSiteId: string
}

export type JoinedSource = { ref: SourceRef; key: string; claim: JoinRestoreClaim; sizeBytes: number }

async function step<T>(progress: (p: Progress) => void, name: string, work: () => Promise<T>, outcome = 'done'): Promise<T> {
  progress({ event: 'step', step: name })
  const value = await work()
  progress({ event: 'stepDone', outcome })
  return value
}

/** What a backup must be for a lost site to come back from it; throws in words, before anything is written. */
export function checkRestorable(ctx: Context, { header, manifest }: Pick<Checked, 'header' | 'manifest'>): void {
  if (header.holds.includes('hq')) {
    throw new Refusal('conflict', `This backup holds HQ and its site ${header.siteName}. HQ's machine is restored without a code, on a machine where nothing runs: ${cmd('restore --from <folder or file>')}`)
  }
  if (!manifest.site.hqUrl || !manifest.siteCredential) {
    throw new Refusal('conflict', `This backup of ${header.siteName} does not carry the site's credential, so the site cannot come back from it as itself. Use a backup taken since this host service's version, or add a site anew in the Fleet Console.`)
  }
}

/** Takes away every part of the site written here; what remains is the machine as it was. */
async function clearSite(ctx: Context): Promise<void> {
  const site = installed(ctx).site
  if (site) {
    await ctx.docker.composeDownWithVolumes(site.project, site.file).catch(() => {})
    await ctx.docker.removeGroup(ctx.names.agentsProject).catch(() => {})
  }
  fs.rmSync(ctx.state.path('site'), { recursive: true, force: true })
}

export function restoreJoinedSite(ctx: Context, source: JoinedSource, pin: ConsolePin, progress: (p: Progress) => void): Promise<RestoredSite> {
  return exclusive('restore', async () => {
    refuseWhereSomethingRuns(ctx)
    const checked = await step(progress, 'Checking the key', () => openChecked(ctx, source.ref, source.key), 'passes')
    const { header, manifest, records } = checked
    let written = false
    try {
      checkRestorable(ctx, checked)
      // The backup the machine said it restores when it joined, under its binding; a file swapped since is refused.
      if (header.siteName !== source.claim.siteName || header.takenAt !== source.claim.takenAt) {
        throw new Refusal('conflict', `The backup at that path is no longer the one this machine said it restores (${source.claim.siteName}, taken ${source.claim.takenAt}). Nothing was changed.`)
      }
      if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
      const paths = await ctx.machinePaths()
      if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot restore.')
      const backupCredential = manifest.siteCredential!
      const renewal = { hqAddress: pin.hqAddress, machineCredential: pin.machineCredential, backupCredential }

      await step(progress, `Asking HQ whether ${header.siteName} can come back here`, async () => {
        const asked = await renewAtHq(ctx, { ...renewal, check: true })
        if (!asked.ok) throw new Refusal('refused' in asked ? 'conflict' : 'failed', `Not restored: ${'refused' in asked ? asked.refused : asked.unknown}. Nothing was changed.`)
      }, 'yes')

      const { pins } = await step(progress, 'Checking the images are signed', async () => {
        const checkedImages = await checkImages(ctx, [{ part: 'site-server', version: manifest.site.version }, { part: 'agent', version: manifest.site.version }])
        await fetchImages(ctx, [POSTGRES_IMAGE, checkedImages.pins['site-server']!, checkedImages.pins.agent!])
        return checkedImages
      }, 'passes')

      written = true
      // The site's stored secrets are sealed with its master key: it comes with the site. The rest are this machine's.
      ctx.state.writeJson(['secrets.json'], { ...installSecrets(ctx.state), siteMasterKey: manifest.secrets.siteMasterKey })
      // Named after this machine, as every site is: the lost machine's name goes with it.
      const site: StoredSite = { ...manifest.site, name: ctx.machine.name, images: { 'site-server': pins['site-server'], agent: pins.agent }, hqUrl: pin.hqAddress }
      ctx.state.writeJson(['site', 'settings.json'], site)
      // Without its credential yet, the compose file starts nothing connected; it is written again once HQ renewed it.
      ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site, installSecrets(ctx.state), paths, await installSubnets(ctx))))
      const here = installed(ctx).site!
      await step(progress, "Starting the site's database", async () => {
        await ctx.backupIO.createProject(here.project, here.file)
        await ctx.backupIO.startServices(here.project, here.file, ['site-db'])
      })
      ctx.state.folder('site', 'data')
      const src = sources(ctx.names, paths)
      await eachPart(records, async (name, bytes) => {
        if (name === PART.siteDatabase) await step(progress, "Restoring the site's database", () => ctx.backupIO.restoreDatabase(src[name].container, src[name].database, bytes))
        else if (name === PART.siteData) await step(progress, "Restoring the site's workspaces", () => ctx.backupIO.writeFolder(src[name], bytes))
      })
      fs.writeFileSync(ctx.state.path('site', 'data', RESTORED_NOTE), `${JSON.stringify({ night: header.night, takenAt: header.takenAt })}\n`, { mode: 0o644 })

      const { credential } = makeSiteCredential(ctx.state, ctx.now())
      const renewed = await step(progress, "Renewing the site's credential at HQ", async () => {
        const r = await renewAtHq(ctx, { ...renewal, newCredential: credential })
        if (r.ok) return r.renewed
        throw new Refusal('refused' in r ? 'conflict' : 'failed', 'refused' in r
          ? `Not restored: ${r.refused}. Nothing is left on ${ctx.machine.name}.`
          : `Not restored: ${r.unknown}. Nothing is left on ${ctx.machine.name}. Run the restore again once HQ answers; if HQ took the new credential before its answer was lost, the site can no longer come back from this backup, and a fleet admin removes it and adds a site anew.`)
      }, 'renewed')

      await step(progress, `Starting the site ${site.name}`, async () => {
        ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site, installSecrets(ctx.state), paths, await installSubnets(ctx))))
        await ctx.docker.composeUp(here.project, here.file)
      }, 'running')
      return { backupId: header.id, sizeBytes: source.sizeBytes, siteName: site.name, formerName: header.siteName, night: header.night, takenAt: header.takenAt, executionSiteId: renewed.executionSiteId }
    } catch (err) {
      await records.return(undefined)
      if (written) await clearSite(ctx)
      if (err instanceof Refusal) throw err
      throw new Refusal('failed', `The restore stopped partway: ${err instanceof Error ? err.message : String(err)} Nothing is left on ${ctx.machine.name}.`)
    }
  })
}
