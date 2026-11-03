/**
 * Erasing (host-management spec §15, diagram 9; adr-0112): a final sealed backup, then the running data removed —
 * each compose project down with its volumes, the agents' group, the site's workspaces, and the settings and
 * secrets — while that backup, the ones before it and the copies in the backup location are kept in the bin for
 * the grace period (`bin.ts`). If the final backup does not complete, nothing is removed. If the removal stops
 * partway, the erase says what is gone; asking again finishes it, with the final backup it already took.
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
import { fullDate, size } from '../cli/backupWords'
import { BackupStore, fileNameOf, nightlyOf } from '../backups/store'
import { exclusiveWhenFree, takeBackup, type OnWait } from '../backups/take'
import { frontDoorOff, frontDoorSettings } from '../frontDoor/frontDoor'
import { frontDoorProject } from '../frontDoor/config'
import { EndedPartway, endChangesOfWhatIsGone } from '../scheduled/scheduler'
import { eraseCompleted, purgeAfterOf, putInBin, unfinishedErase, type BinEntry } from './bin'
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

/** Removes the running data, adding to `gone` what is removed as each step ends. */
async function removeRunningData(ctx: Context, gone: string[]): Promise<void> {
  const { hq, site } = installed(ctx)
  if (site) {
    await ctx.docker.composeDownWithVolumes(site.project, site.file)
    gone.push("the site's containers and database")
    // The agents are a group of their own, which the site's project never removes.
    await ctx.docker.removeGroup(ctx.names.agentsProject)
    gone.push("the agents' containers")
  }
  if (hq) {
    // The front door serves HQ's address only, so it goes with HQ; its certificates are not kept.
    const door = ctx.state.path('front-door', 'compose.json')
    if (frontDoorSettings(ctx) && fs.existsSync(door)) {
      await frontDoorOff(ctx)
      await ctx.docker.composeDownWithVolumes(frontDoorProject(ctx.names), door)
      gone.push('the front door')
    }
    await ctx.docker.composeDownWithVolumes(hq.project, hq.file)
    gone.push("HQ's containers and database")
  }
  // The site's workspaces are a folder in the state folder; the settings and secrets go with them.
  for (const part of hq ? ['site', 'hq', 'front-door'] : ['site']) fs.rmSync(ctx.state.path(part), { recursive: true, force: true })
  fs.rmSync(ctx.state.path('secrets.json'), { force: true })
  forgetSuspended(ctx)
}

function stoppedPartway(target: EraseRequest['target'], entry: BinEntry, gone: string[], err: unknown): EndedPartway {
  const why = (err instanceof Error ? err.message : String(err)).replace(/\.?$/, '.')
  const what = target === 'hq' ? 'HQ and its site' : 'the site'
  const removed = gone.length ? `Already removed: ${gone.join(', ')}.` : `Nothing was removed yet, though ${what} may be stopped.`
  const again = cmd(target === 'hq' ? 'hq erase' : 'site erase')
  return new EndedPartway(
    `The erase of ${what} stopped partway: ${why} ${removed} The final backup taken before anything was removed is kept until ${fullDate(new Date(entry.purgeAfter))}. ` +
    `To finish the erase, ask again (${again}): it takes no new backup. Once it has finished, ${cmd(target === 'hq' ? 'hq restore' : 'site restore')} brings everything back from that backup.`,
  )
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
    const installedAt = installed(ctx)[request.target]?.settings.installedAt
    // An erase of this install that stopped partway already took the final backup, before anything was removed; one
    // taken now would hold what is left.
    let entry = unfinishedErase(ctx, request.target, installedAt)
    if (entry) {
      progress({ event: 'step', step: 'Finishing the erase that stopped partway' })
      progress({ event: 'stepDone', outcome: 'its final backup is kept' })
    } else {
      const store = new BackupStore(ctx.state)
      const location = store.location()
      const final = await step(progress, 'Taking the final sealed backup', () => finalBackup(ctx), f => `done (${size(f.sizeBytes)})`)
      const onMachine = (await store.list()).map(b => b.name)
      const copies = location ? await locationCopies(ctx, location.path, onMachine) : null
      const erasedAt = ctx.now()
      entry = putInBin(ctx, {
        target: request.target,
        hqAddress: hq?.settings.address ?? null,
        siteName: site?.settings.name ?? ctx.machine.name,
        erasedAt: erasedAt.toISOString(),
        purgeAfter: purgeAfterOf(erasedAt).toISOString(),
        finalBackup: final.name,
        location: copies,
        ...(installedAt ? { installedAt } : {}),
        complete: false,
      }, onMachine)
    }
    const hqTold = request.target === 'site' ? await waitForSiteToTellHq(ctx, since) : null
    const gone: string[] = []
    try {
      await step(progress, request.target === 'hq' ? 'Stopping HQ and its site' : 'Stopping the site', async () => {
        if (site) await ctx.docker.composeStop(site.project, site.file)
        if (hq) await ctx.docker.composeStop(hq.project, hq.file)
      })
      await step(progress, 'Removing the running data', () => removeRunningData(ctx, gone))
    } catch (err) {
      throw stoppedPartway(request.target, entry, gone, err)
    }
    entry = eraseCompleted(ctx, entry)
    // What else was scheduled for what is gone would only fail at its time: it ends now, saying why.
    await endChangesOfWhatIsGone(ctx)
    return { entry, hqTold }
  }, onWait)
}
