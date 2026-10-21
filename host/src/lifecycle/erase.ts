/**
 * Erasing (host-management spec §15, diagram 9; adr-0112): a final sealed backup, then the running data removed —
 * each compose project down with its volumes, the agents' group, the site's workspaces, and the settings and
 * secrets — while that backup, the ones before it and the copies in the backup location are kept in the bin for
 * the grace period (`bin.ts`). If the final backup does not complete, nothing is removed.
 *
 * Erasing HQ takes its site with it, since the site carries HQ on HQ's machine; a site on its own machine is
 * erased by itself. Confirming HQ's erase needs its address typed in; the CLI asks for a site's name.
 */
import fs from 'node:fs'
import type { EraseRequest } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { size } from '../cli/backupWords'
import { BackupStore, fileNameOf, nightlyOf } from '../backups/store'
import { exclusiveWhenFree, takeBackup, type OnWait } from '../backups/take'
import { frontDoorOff, frontDoorSettings } from '../frontDoor/frontDoor'
import { frontDoorProject } from '../frontDoor/config'
import { endChangesOfWhatIsGone } from '../scheduled/scheduler'
import { purgeAfterOf, putInBin, type BinEntry } from './bin'
import { forgetSuspended } from './suspend'
import { waitForSiteToTellHq } from './siteTold'

export type EraseOutcome = {
  entry: BinEntry
  /** For a site on its own machine: whether HQ was told it has gone. Null for HQ, which is gone itself. */
  hqTold: boolean | null
}

/** Why `typed` is not HQ's address, in words; null when it is. */
export function addressProblem(typed: string, address: string): string | null {
  if (typed === address) return null
  const hint = typed.replace(/\/+$/, '') === address ? ', without the slash' : ''
  return `Not erased: that is not HQ's address (it is ${address}${hint}). Nothing changed.`
}

export function eraseCheck(ctx: Context, request: EraseRequest): void {
  const { hq, site } = installed(ctx)
  if (request.target === 'hq') {
    if (!hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ, so there is no HQ to erase.`)
    const problem = addressProblem(request.confirmAddress, hq.settings.address)
    if (problem) throw new Refusal('conflict', problem)
    return
  }
  if (!site) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}, so there is no site to erase.`)
  if (hq) {
    throw new Refusal('conflict', `The site ${site.settings.name} carries HQ here, so it is erased only with HQ: ${cmd('hq erase')}`)
  }
}

async function step<T>(progress: (p: Progress) => void, name: string, work: () => Promise<T>, outcome: (v: T) => string = () => 'done'): Promise<T> {
  progress({ event: 'step', step: name })
  const value = await work()
  progress({ event: 'stepDone', outcome: outcome(value) })
  return value
}

/** The databases must answer for their dumps, even when what was erased had been suspended. */
async function startDatabases(ctx: Context): Promise<void> {
  const { hq, site } = installed(ctx)
  if (hq) await ctx.backupIO.startServices(hq.project, hq.file, ['hq-db'])
  if (site) await ctx.backupIO.startServices(site.project, site.file, ['site-db'])
}

async function finalBackup(ctx: Context): Promise<{ name: string; inLocation: boolean; sizeBytes: number }> {
  try {
    await startDatabases(ctx)
    const taken = await takeBackup(ctx, 'now')
    const found = await new BackupStore(ctx.state).find(taken.id)
    if (!found) throw new Error('the backup was not where it was written.')
    return { name: fileNameOf(found.header), inLocation: taken.inLocation, sizeBytes: taken.sizeBytes }
  } catch (err) {
    const why = (err instanceof Error ? err.message : String(err)).replace(/^The backup did not complete, and nothing was kept: /, '')
    throw new Refusal('failed', `Not erased: the final backup did not complete, so nothing was removed. ${why}`)
  }
}

async function removeRunningData(ctx: Context): Promise<void> {
  const { hq, site } = installed(ctx)
  if (site) {
    await ctx.docker.composeDownWithVolumes(site.project, site.file)
    // The agents are a group of their own, which the site's project never removes.
    await ctx.docker.removeGroup(ctx.names.agentsProject)
  }
  if (hq) {
    // The front door serves HQ's address only, so it goes with HQ; its certificates are not kept.
    const door = ctx.state.path('front-door', 'compose.json')
    if (frontDoorSettings(ctx) && fs.existsSync(door)) {
      await frontDoorOff(ctx)
      await ctx.docker.composeDownWithVolumes(frontDoorProject(ctx.names), door)
    }
    await ctx.docker.composeDownWithVolumes(hq.project, hq.file)
  }
  // The site's workspaces are a folder in the state folder; the settings and secrets go with them.
  for (const part of hq ? ['site', 'hq', 'front-door'] : ['site']) fs.rmSync(ctx.state.path(part), { recursive: true, force: true })
  fs.rmSync(ctx.state.path('secrets.json'), { force: true })
  forgetSuspended(ctx)
}

/**
 * This machine's copies in the backup location: those of the backups on the machine, the final one among them
 * when it was written there, and the older nightly ones the location keeps longer.
 */
async function locationCopies(ctx: Context, dir: string, mine: string[]): Promise<{ path: string; names: string[] }> {
  const there = (await ctx.backupIO.folder.list(dir).catch(() => [])).map(f => f.name)
  const nightly = new Set(nightlyOf(ctx.machine.name, there))
  return { path: dir, names: there.filter(n => mine.includes(n) || nightly.has(n)) }
}

export function eraseRun(
  ctx: Context, request: EraseRequest, progress: (p: Progress) => void, waiting: OnWait = () => {},
): Promise<EraseOutcome> {
  const onWait: OnWait = holder => {
    progress(holder ? { event: 'step', step: `Waiting for the ${holder} to finish` } : { event: 'stepDone', outcome: 'done' })
    return waiting(holder)
  }
  return exclusiveWhenFree(ctx, 'erase', async () => {
    eraseCheck(ctx, request)
    const since = ctx.now()
    const { hq, site } = installed(ctx)
    const store = new BackupStore(ctx.state)
    const location = store.location()
    const final = await step(progress, 'Taking the final sealed backup', () => finalBackup(ctx), f => `done (${size(f.sizeBytes)})`)
    const onMachine = (await store.list()).map(b => b.name)
    const copies = location ? await locationCopies(ctx, location.path, onMachine) : null
    const erasedAt = ctx.now()
    const entry = putInBin(ctx, {
      target: request.target,
      hqAddress: hq?.settings.address ?? null,
      siteName: site?.settings.name ?? ctx.machine.name,
      erasedAt: erasedAt.toISOString(),
      purgeAfter: purgeAfterOf(erasedAt).toISOString(),
      finalBackup: final.name,
      location: copies,
    }, onMachine)
    const hqTold = request.target === 'site' ? await waitForSiteToTellHq(ctx, since) : null
    await step(progress, request.target === 'hq' ? 'Stopping HQ and its site' : 'Stopping the site', async () => {
      if (site) await ctx.docker.composeStop(site.project, site.file)
      if (hq) await ctx.docker.composeStop(hq.project, hq.file)
    })
    await step(progress, 'Removing the running data', () => removeRunningData(ctx))
    // What else was scheduled for what is gone would only fail at its time: it ends now, saying why.
    await endChangesOfWhatIsGone(ctx)
    return { entry, hqTold }
  }, onWait)
}
