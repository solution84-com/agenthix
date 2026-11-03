/**
 * The bin an erase leaves (host-management spec §15, diagram 9): like any service's recycle bin. The final sealed
 * backup, and the backups taken before it, move out of the nightly folder into the bin, where nightly pruning
 * never reaches; the copies in the backup location stay where they are. For the grace period a restore brings
 * the erased HQ back from the bin; after it everything is purged, the backup location's copies included.
 *
 * Each erase is an entry of its own, purged at its own time: erasing again what was installed since keeps the earlier
 * entry, and a restore brings back the newest. An erase that stopped partway is an entry not yet `complete`; asking
 * for the erase again finishes it, with the final backup it took before anything was removed.
 *
 * A purge that cannot reach the backup location keeps the entry and tries again, saying why in `status`, rather
 * than forgetting copies it was asked to remove.
 */
import fs from 'node:fs'
import type { HostTarget } from '@agenthix/core'
import type { Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { BackupStore } from '../backups/store'
import { restoreOnNewMachine, type RestoreResult } from '../backups/restore'

/** How long an erase can be undone (spec §15). */
export const GRACE_DAYS = 30
const DAY_MS = 24 * 60 * 60_000
const FILE = 'bin.json'

export type BinEntry = {
  target: HostTarget
  hqAddress: string | null
  siteName: string
  erasedAt: string
  purgeAfter: string
  /** The final backup's file name; first of `backups`. */
  finalBackup: string
  /** Every backup moved into the bin, the final one first. */
  backups: string[]
  /** The backup location's copies of what was erased, as they were at the erase; null when none is set. */
  location: { path: string; names: string[] } | null
  /** The `installedAt` of the HQ or site erased, so a retry finishes this erase and not one of a later install. */
  installedAt?: string
  /** False while the running data is not all removed: the erase stopped partway, and asking again finishes it. */
  complete?: boolean
  /** Why the last purge could not finish; it is tried again. */
  purgeProblem?: string
}

export const purgeAfterOf = (from: Date) => new Date(from.getTime() + GRACE_DAYS * DAY_MS)

const dirOf = (ctx: Context) => ctx.state.folder('bin')

export function binEntries(ctx: Context): BinEntry[] {
  const v = ctx.state.readJson('bin', FILE) as { entries?: unknown } | null
  return Array.isArray(v?.entries) ? (v.entries as BinEntry[]) : []
}

function write(ctx: Context, entries: BinEntry[]): void {
  ctx.state.writeJson(['bin', FILE], { entries })
}

/** Moves the install's backups into the bin and records the entry; the final backup is the one that restores. */
export function putInBin(ctx: Context, entry: Omit<BinEntry, 'backups'>, others: string[]): BinEntry {
  const store = new BackupStore(ctx.state)
  const dir = dirOf(ctx)
  const backups = [entry.finalBackup, ...others.filter(n => n !== entry.finalBackup)]
  for (const name of backups) fs.renameSync(store.path(name), `${dir}/${name}`)
  const full: BinEntry = { ...entry, backups }
  write(ctx, [...binEntries(ctx), full])
  return full
}

const sameEntry = (a: BinEntry, b: BinEntry) => a.finalBackup === b.finalBackup

/** The erase of this install of `target` that stopped partway, if one is in the bin. */
export function unfinishedErase(ctx: Context, target: HostTarget, installedAt: string | undefined): BinEntry | null {
  return binEntries(ctx).find(e => e.target === target && e.complete === false && e.installedAt === installedAt) ?? null
}

/** Records that the erase in `entry` removed all the running data. */
export function eraseCompleted(ctx: Context, entry: BinEntry): BinEntry {
  const done = { ...entry, complete: true }
  write(ctx, binEntries(ctx).map(e => (sameEntry(e, entry) ? done : e)))
  return done
}

/** Removes what each entry whose grace period has passed holds, here and in the backup location. */
export async function purgeDue(ctx: Context): Promise<void> {
  const now = ctx.now()
  const kept: BinEntry[] = []
  for (const entry of binEntries(ctx)) {
    if (now.getTime() < Date.parse(entry.purgeAfter)) {
      kept.push(entry)
      continue
    }
    const left: string[] = []
    let problem: string | undefined
    for (const name of entry.location?.names ?? []) {
      try {
        await ctx.backupIO.folder.remove(entry.location!.path, name)
      } catch (err) {
        left.push(name)
        problem = `The copies in ${entry.location!.path} could not be removed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    if (problem) {
      kept.push({ ...entry, location: { path: entry.location!.path, names: left }, purgeProblem: problem })
      continue
    }
    for (const name of entry.backups) fs.rmSync(`${dirOf(ctx)}/${name}`, { force: true })
  }
  write(ctx, kept)
}

/** Every hour: purges what is due. Returns the stop function. */
export function startBinPurge(ctx: Context, intervalMs = 60 * 60_000, log: (line: string) => void = () => {}): () => void {
  const tick = () => { purgeDue(ctx).catch(err => log(`The erased backups' purge: ${err instanceof Error ? err.message : String(err)}`)) }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

/**
 * Brings back what was erased from the bin, as a restore onto a machine where nothing runs. The backups go back
 * to the nightly folder first, where a restore reads them, and return to the bin if the restore does not finish.
 */
export async function restoreFromBin(ctx: Context, target: HostTarget, progress: (p: Progress) => void): Promise<RestoreResult> {
  const entry = binEntries(ctx).filter(e => e.target === target).at(-1)
  if (!entry) {
    throw new Refusal('not_found', target === 'hq'
      ? `No erased HQ is kept on ${ctx.machine.name}. To bring HQ back from a backup location or an export: ${cmd('restore --from <folder or file>')}`
      : `No erased site is kept on ${ctx.machine.name}.`)
  }
  const store = new BackupStore(ctx.state)
  const dir = dirOf(ctx)
  const back = () => { for (const n of entry.backups) if (fs.existsSync(store.path(n))) fs.renameSync(store.path(n), `${dir}/${n}`) }
  fs.renameSync(`${dir}/${entry.finalBackup}`, store.path(entry.finalBackup))
  let result: RestoreResult
  try {
    // The bin's backup is sealed to this machine's own key, so no key is asked for.
    result = await restoreOnNewMachine(ctx, { kind: 'machine', name: entry.finalBackup }, '', progress)
  } catch (err) {
    back()
    throw err
  }
  for (const n of entry.backups.slice(1)) if (fs.existsSync(`${dir}/${n}`)) fs.renameSync(`${dir}/${n}`, store.path(n))
  write(ctx, binEntries(ctx).filter(e => !sameEntry(e, entry)))
  return result
}
