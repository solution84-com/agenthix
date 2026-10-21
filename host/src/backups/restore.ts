/**
 * Restoring (spec §12, adr-0112): onto the same machine — after backing up what is there first, so the restore
 * can be undone — or onto a new one, where nothing runs yet (`agenthix restore --from`). Each checks the key, the
 * namespace and the version before anything changes (`restoreSource.ts`), then stops what runs, writes the
 * settings and secrets back, restores each database and folder, and starts HQ and its site again. The site is
 * left a note of the backup it came back from, which it gives HQ when it reconnects, so HQ can say what was lost.
 */
import fs from 'node:fs'
import type { Progress } from '../sockets/lineServer'
import { composeJson, defaultSiteProject, hqProject, type MachinePaths } from '../compose/projects'
import { checkImages, fetchImages } from '../images/images'
import { POSTGRES_IMAGE } from '../images/published'
import { installed, type Context, type StoredHq, type StoredSite } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { eachPart, PART, sources, type Manifest } from './parts'
import { openChecked, type Checked, type SourceRef } from './restoreSource'
import { exclusive, takeBackup } from './take'
import { checkSameSite, restoreSiteInPlace } from './siteInPlace'
import { consoleProject } from '../compose/console'
import { localHqAddress, type StoredConsole } from '../install/console'
import { installSubnets, type InstallSubnets } from '../compose/subnets'

/** The note the site reads from its data folder (core's `SiteRestoreReport`). */
export const RESTORED_NOTE = 'restored.json'

export type RestoreResult = {
  hqAddress: string | null
  siteName: string
  night: string
  takenAt: string
  holds: ('hq' | 'site')[]
  /** Whether HQ answered once it was started again. */
  hqAnswers: boolean
}

async function step<T>(progress: (p: Progress) => void, name: string, work: () => Promise<T>, outcome = 'done'): Promise<T> {
  progress({ event: 'step', step: name })
  const value = await work()
  progress({ event: 'stepDone', outcome })
  return value
}

/**
 * A restore onto this machine of a backup on it, or in its backup location; the current state is backed up first.
 * HQ's machine goes back with HQ and its site; another machine's site alone, as the same site (`siteInPlace.ts`).
 */
export function restoreHere(ctx: Context, ref: SourceRef, key: string | undefined, progress: (p: Progress) => void): Promise<RestoreResult> {
  return exclusive('restore', async () => {
    const checked = await step(progress, 'Checking the key', () => openChecked(ctx, ref, key), 'passes')
    try {
      fitsHere(ctx, checked)
    } catch (err) {
      await checked.records.return(undefined)
      throw err
    }
    if (installed(ctx).site) {
      try {
        await step(progress, 'Backing up what is here first', () => takeBackup(ctx, 'beforeRestore'))
      } catch (err) {
        await checked.records.return(undefined)
        throw err
      }
    }
    if (!checked.manifest.hq) return { ...(await restoreSiteInPlace(ctx, checked, progress)), hqAddress: null, hqAnswers: false }
    return apply(ctx, checked, progress, { inPlace: true })
  })
}

/** A backup goes back over what runs here only when it holds the same: HQ with its site, or this site alone. */
function fitsHere(ctx: Context, checked: Checked): void {
  const here = installed(ctx)
  const { header } = checked
  if (header.holds.includes('hq') && !here.hq) {
    throw new Refusal('conflict', `This backup holds HQ and its site, and HQ does not run on ${ctx.machine.name}. Nothing was changed.`)
  }
  if (!header.holds.includes('hq')) {
    if (here.hq) throw new Refusal('conflict', `This backup holds a site alone, and ${ctx.machine.name} runs HQ: HQ's machine goes back with HQ. Nothing was changed.`)
    checkSameSite(ctx, checked)
  }
}

/** `agenthix restore --from` on a machine where nothing runs yet. */
export function restoreOnNewMachine(ctx: Context, ref: SourceRef, key: string, progress: (p: Progress) => void): Promise<RestoreResult> {
  return exclusive('restore', async () => {
    refuseWhereSomethingRuns(ctx)
    // The CLI checked the key already, and said so; checked again here, before anything changes.
    return apply(ctx, await openChecked(ctx, ref, key), progress)
  })
}

/** Where a fleet admin restores an earlier night of what runs on a machine: its page under Backups. */
export function restoreDoor(ctx: Context, hq: boolean): string {
  return `in the Fleet Console, Backups › ${hq ? 'HQ' : ctx.machine.name}, Restore… beside the night. It backs up the current state first`
}

/**
 * On a machine that already runs HQ or a site, a restore from a folder is refused: going back to an earlier night is
 * a fleet admin's, from the Fleet Console. A machine admin has no command for it.
 */
export function refuseWhereSomethingRuns(ctx: Context): void {
  const here = installed(ctx)
  if (here.hq) {
    throw new Refusal('already_installed', `Not restored: HQ already runs on ${ctx.machine.name}. To go back to an earlier night, a fleet admin restores it ${restoreDoor(ctx, true)}.`)
  }
  if (here.site) {
    throw new Refusal('already_installed', `Not restored: the site ${here.site.settings.name} already runs on ${ctx.machine.name}. To go back to an earlier night, a fleet admin restores it ${restoreDoor(ctx, false)}.`)
  }
}

async function apply(ctx: Context, { header, manifest, records }: Checked, progress: (p: Progress) => void, { inPlace = false } = {}): Promise<RestoreResult> {
  try {
    if (!manifest.hq) {
      throw new Refusal('conflict', `This is a backup of the site ${manifest.site.name}. It comes back as the same site only with a code from Restore from a backup… in the Fleet Console: ${cmd('restore --from <folder or file> <hq address> <code>')}`)
    }
    if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
    const paths = await ctx.machinePaths()
    if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot restore.')
    const pinned = await step(progress, 'Checking the images are signed', () => images(ctx, manifest))
    const { hq, site } = pinned
    // In place, the Fleet Console that runs here is left as it is: it is the fleet's, not HQ's, and it may be the one
    // that asked for this restore. Its keys and the machines it knows come back only on a new machine.
    const fleetConsole = inPlace && ctx.state.readJson('console', 'settings.json') ? null : pinned.console
    await step(progress, 'Stopping HQ and the site', () => stopAll(ctx))
    const written = await step(progress, 'Writing HQ\'s and the site\'s settings and secrets', async () => writeSettings(ctx, manifest, hq, site, paths, header.takenAt, await installSubnets(ctx)))
    // Compose makes HQ's storage volume (and the databases'), so that it carries the labels `compose down -v`
    // removes by; a volume made by `docker volume create` or by the first mount would be left behind.
    await step(progress, 'Starting the databases', async () => {
      await ctx.backupIO.createProject(written.hq.project, written.hq.file)
      await ctx.backupIO.createProject(written.site.project, written.site.file)
      await ctx.backupIO.startServices(written.hq.project, written.hq.file, ['hq-db'])
      await ctx.backupIO.startServices(written.site.project, written.site.file, ['site-db'])
      if (fleetConsole) await ctx.backupIO.createProject(ctx.names.consoleProject, writeConsole(ctx, fleetConsole, manifest, hq, await installSubnets(ctx)))
    })
    const src = sources(ctx.names, paths)
    ctx.state.folder('site', 'data')
    const labels: Record<string, string> = {
      [PART.hqDatabase]: "Restoring HQ's database",
      [PART.hqStorage]: "Restoring HQ's storage folder",
      [PART.siteDatabase]: "Restoring the site's database",
      [PART.siteData]: "Restoring the site's workspaces",
      [PART.consoleState]: "Restoring the Fleet Console's keys",
    }
    await eachPart(records, async (name, bytes) => {
      const label = labels[name]
      if (!label) return
      await step(progress, label, async () => {
        if (name === PART.hqDatabase || name === PART.siteDatabase) {
          await ctx.backupIO.restoreDatabase(src[name].container, src[name].database, bytes)
        } else if (name !== PART.consoleState || fleetConsole) {
          await ctx.backupIO.writeFolder(src[name as typeof PART.hqStorage | typeof PART.siteData | typeof PART.consoleState], bytes)
        }
      })
    })
    fs.writeFileSync(ctx.state.path('site', 'data', RESTORED_NOTE), `${JSON.stringify({ night: header.night, takenAt: header.takenAt })}\n`, { mode: 0o644 })
    const hqAnswers = await step(progress, 'Starting HQ and the site', async () => {
      await ctx.docker.composeUp(written.hq.project, written.hq.file)
      await ctx.docker.composeUp(written.site.project, written.site.file)
      if (fleetConsole) await ctx.docker.composeUp(ctx.names.consoleProject, ctx.state.path('console', 'compose.json'))
      return waitForHq(ctx)
    })
    return { hqAddress: hq.address, siteName: site.name, night: header.night, takenAt: header.takenAt, holds: header.holds, hqAnswers }
  } catch (err) {
    await records.return(undefined)
    if (err instanceof Refusal) throw err
    throw new Refusal('failed', `The restore stopped partway: ${err instanceof Error ? err.message : String(err)} See how the machine is: ${cmd('status')}`)
  }
}

/** The images of the backup's version, each checked and fetched as install does. */
async function images(ctx: Context, m: Manifest): Promise<{ hq: StoredHq; site: StoredSite; console: StoredConsole | null }> {
  const hq = m.hq!
  const { pins } = await checkImages(ctx, [
    { part: 'hq-server', version: hq.version }, { part: 'hq-web', version: hq.version },
    { part: 'site-server', version: m.site.version }, { part: 'agent', version: m.site.version },
    ...(m.console ? [{ part: 'console' as const, version: m.console.version }] : []),
  ])
  await fetchImages(ctx, [POSTGRES_IMAGE, pins['hq-server']!, pins['hq-web']!, pins['site-server']!, pins.agent!, ...(m.console ? [pins.console!] : [])])
  const fleetConsole = m.console ? { ...m.console, images: { console: pins.console } } : null
  return {
    hq: { ...hq, images: { 'hq-server': pins['hq-server'], 'hq-web': pins['hq-web'] } },
    // A site is named after the machine it runs on, so a restore onto another machine renames it.
    site: { ...m.site, name: ctx.machine.name, images: { 'site-server': pins['site-server'], agent: pins.agent } },
    console: fleetConsole,
  }
}

/** The Fleet Console beside the restored HQ, at HQ's local listener, admitted by the restored pairing secret. */
function writeConsole(ctx: Context, fleetConsole: StoredConsole, m: Manifest, hq: StoredHq, subnets: InstallSubnets): string {
  const settings: StoredConsole = { ...fleetConsole, hqAddress: localHqAddress(hq.port), onHqMachine: true }
  ctx.state.writeJson(['console', 'settings.json'], settings)
  return ctx.state.writePrivate(['console', 'compose.json'], composeJson(consoleProject(ctx.names, settings, ctx.machine.name, { pairingSecret: m.secrets.consolePairingSecret }, subnets)))
}

async function stopAll(ctx: Context): Promise<void> {
  const here = installed(ctx)
  if (here.site) await ctx.docker.composeStop(here.site.project, here.site.file)
  if (here.hq) await ctx.docker.composeStop(here.hq.project, here.hq.file)
}

function writeSettings(ctx: Context, m: Manifest, hq: StoredHq, site: StoredSite, paths: MachinePaths, takenAt: string, subnets: InstallSubnets) {
  ctx.state.writeJson(['secrets.json'], m.secrets)
  ctx.state.writeJson(['hq', 'settings.json'], hq)
  ctx.state.writeJson(['site', 'settings.json'], site)
  const project = hqProject(ctx.names, hq, m.secrets, ctx.machine.name, subnets)
  // HQ takes back what its sites hold only when it knows it was restored (hq's sites/restoreReconcile.ts). The
  // next install or upgrade writes the project again without it, once the sites have long reconnected.
  const server = project.services['hq-server'] as { environment: Record<string, string> }
  server.environment = { ...server.environment, HQ_RESTORED_FROM: takenAt }
  ctx.state.writePrivate(['hq', 'compose.json'], composeJson(project))
  ctx.state.writePrivate(['site', 'compose.json'], composeJson(defaultSiteProject(ctx.names, site, m.secrets, paths, subnets)))
  const now = installed(ctx)
  return { hq: now.hq!, site: now.site! }
}

async function waitForHq(ctx: Context): Promise<boolean> {
  const until = ctx.now().getTime() + ctx.waits.hqMs
  for (;;) {
    if (await ctx.hqControl.status()) return true
    if (ctx.now().getTime() >= until) return false
    await ctx.sleep(ctx.waits.pollMs)
  }
}

/** For hq's move to a new machine, which restores the same way but starts nothing until it takes over (move/restoreHq.ts). */
export { images as restoreImages, writeConsole as writeRestoredConsole }
