/**
 * Taking a backup (spec §12, adr-0112): everything the site on this machine carries, sealed to the machine's own
 * key and kept in the state folder, labelled with its night; then, when a backup location is set, the same backup
 * for the key of whoever set it, written there. One backup or restore runs at a time.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { BackupSummary } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { locationLabel } from './cloudLocation'
import { machineHolder } from './keys'
import { backupRecords, manifestOf } from './parts'
import { newHeader, rewrapBackup, sealBackup, type BackupHeader } from './seal'
import { BackupStore, LOCATION_NIGHTS_KEPT, fileNameOf, nightlyOf, summaryOf } from './store'

let running: string | null = null

/** What holds the machine now — `backup`, `restore`, `move`, `erase` … — or null when nothing does. */
export const holding = (): string | null => running

/** Runs one backup or restore at a time; another is refused in words while it runs. */
export async function exclusive<T>(what: string, work: () => Promise<T>): Promise<T> {
  if (running) throw new Refusal('busy', `A ${running} is running on this machine. Wait for it to finish, then try again.`)
  running = what
  try {
    return await work()
  } finally {
    running = null
  }
}

/** How long a scheduled change waits for whatever holds the machine, such as the nightly backup, before it fails. */
export const BUSY_WAIT_MS = 30 * 60_000
const BUSY_POLL_MS = 30_000

/** Told what a change waits for when it starts to wait, and null once, after waiting, it has the machine. */
export type OnWait = (holder: string | null) => void | Promise<void>

/** What a change says while it waits: `Waiting for the backup to finish …`. */
export const waitingText = (holder: string) =>
  `Waiting for the ${holder} to finish; it starts as soon as that has, if within ${BUSY_WAIT_MS / 60_000} minutes.`

/**
 * `exclusive` for a scheduled change: while a backup or another change holds the machine it waits, up to
 * `BUSY_WAIT_MS`, telling `onWait` once what it waits for, and again once it has the machine; past that it fails, in
 * words saying why.
 */
export async function exclusiveWhenFree<T>(
  ctx: Pick<Context, 'now' | 'sleep'>, what: string, work: () => Promise<T>, onWait: OnWait = () => {},
): Promise<T> {
  const until = ctx.now().getTime() + BUSY_WAIT_MS
  let told = false
  for (;;) {
    const holder = running
    // Nothing awaits between this check and `exclusive` taking the machine, so nothing can take it in between.
    if (!holder) {
      return exclusive(what, async () => {
        if (told) await onWait(null)
        return work()
      })
    }
    const left = until - ctx.now().getTime()
    if (left <= 0) {
      throw new Refusal('busy', `The ${holder} on this machine had not finished after ${BUSY_WAIT_MS / 60_000} minutes, so the ${what} did not start. Nothing was changed.`)
    }
    if (!told) {
      told = true
      await onWait(holder)
    }
    await ctx.sleep(Math.min(BUSY_POLL_MS, left))
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The night a backup belongs to: the evening before the small hours it is taken in (`YYYY-MM-DD`, machine time). */
export function nightOf(at: Date): string {
  const d = new Date(at.getTime() - 12 * 3600_000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export async function takeBackup(ctx: Context, kind: BackupHeader['kind']): Promise<BackupSummary> {
  const { hq, site } = installed(ctx)
  if (!site) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}, so there is nothing to back up. To install HQ and its site here: ${cmd('install')}`)
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot back up the site.')
  const store = new BackupStore(ctx.state)
  const at = ctx.now()
  const header = newHeader({
    id: crypto.randomBytes(4).toString('hex'),
    kind,
    namespace: ctx.names.namespace,
    machine: ctx.machine.name,
    siteName: site.settings.name,
    holds: hq ? ['hq', 'site'] : ['site'],
    night: nightOf(at),
    takenAt: at.toISOString(),
    version: (hq ?? site).settings.version,
    hqAddress: hq?.settings.address ?? null,
  })
  const name = fileNameOf(header)
  const tmp = store.path(`.${name}.part`)
  const records = backupRecords(ctx.backupIO, ctx.names, paths, manifestOf(ctx, hq?.settings ?? null, site.settings))
  try {
    await pipeline(Readable.from(sealBackup(header, machineHolder(ctx.state).publicKey, records)), fs.createWriteStream(tmp, { mode: 0o600 }))
    fs.renameSync(tmp, store.path(name))
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    const error = err instanceof Error ? err.message : String(err)
    store.record({ last: { at: at.toISOString(), ok: false, error } })
    throw new Refusal('failed', `The backup did not complete, and nothing was kept: ${error}`)
  }
  const sizeBytes = fs.statSync(store.path(name)).size
  store.record({ last: { at: at.toISOString(), ok: true, id: header.id, sizeBytes } })
  await store.prune(at)
  const copied = await copyToLocation(ctx, store, name)
  return summaryOf(header, sizeBytes, copied)
}

/** Writes a backup on the machine to the backup location, sealed for that location's key. False when none is set. */
export async function copyToLocation(ctx: Context, store: BackupStore, name: string): Promise<boolean> {
  const location = store.location()
  if (!location) return false
  const at = ctx.now().toISOString()
  try {
    const { bytes } = await rewrapBackup(store.bytes(name), machineHolder(ctx.state), Buffer.from(location.publicKey, 'base64url'))
    await ctx.backupIO.folder.write(location.path, name, bytes)
    await pruneLocation(ctx, location.path)
    store.record({ copy: { at, ok: true, path: locationLabel(location) } })
    return true
  } catch (err) {
    store.record({ copy: { at, ok: false, path: locationLabel(location), error: err instanceof Error ? err.message : String(err) } })
    return false
  }
}

async function pruneLocation(ctx: Context, dir: string): Promise<void> {
  const nightly = nightlyOf(ctx.machine.name, (await ctx.backupIO.folder.list(dir)).map(f => f.name))
  for (const old of nightly.slice(LOCATION_NIGHTS_KEPT)) await ctx.backupIO.folder.remove(dir, old)
}
