/**
 * What a backup holds (spec §12) and in which order. The first part is the manifest — the settings and secrets of
 * what the site carries, `SECRETS_MASTER_KEY` among them, without which what HQ saves cannot be read after a
 * restore — so a restore reads it, and checks it, before anything on the machine changes. Then each database's
 * dump and each storage folder's contents: HQ's database and storage folder when the site carries HQ, and always
 * the site's database and its data folder, which holds the workspaces.
 *
 * A site a Fleet Console added also puts in the manifest the credential it proves itself to HQ with (adr-0119), sealed
 * like the rest: restoring the backup on a new machine brings back the same site, which renews the credential before
 * it starts. Whoever holds the backup and its key holds no more than the backup already gives.
 */
import { siteDataPath, type MachinePaths } from '../compose/projects'
import type { Context, StoredHq, StoredSite } from '../service/context'
import { installSecrets, type InstallSecrets } from '../state/secrets'
import type { InstallNames } from '../state/namespace'
import { DamagedBackup, type SealedRecord } from './seal'
import { consoleHere, type StoredConsole } from '../install/console'
import { readSiteCredential } from '../install/siteCompose'
import type { BackupIO, Bytes, FolderSource } from './io'

export type Manifest = {
  hq: StoredHq | null
  site: StoredSite
  secrets: InstallSecrets
  /** The Fleet Console, when it runs on this machine: its keys go with the site it runs beside (spec §7). */
  console?: StoredConsole | null
  /** The credential of a site a Fleet Console added; null for HQ's default site, connected by the pairing secret. */
  siteCredential?: string | null
}

export const PART = {
  manifest: 'manifest',
  hqDatabase: 'hq/database',
  hqStorage: 'hq/storage',
  siteDatabase: 'site/database',
  siteData: 'site/data',
  consoleState: 'console/state',
} as const

/** Where each part comes from on this machine, and goes back to. */
export function sources(names: InstallNames, paths: MachinePaths) {
  return {
    [PART.hqDatabase]: { container: names.container('hq-db'), database: names.hqDatabase },
    [PART.siteDatabase]: { container: names.container('site-db'), database: names.siteDatabase },
    [PART.hqStorage]: { volume: names.hqStorageVolume } satisfies FolderSource,
    [PART.siteData]: { machinePath: siteDataPath(paths) } satisfies FolderSource,
    [PART.consoleState]: { volume: names.consoleStateVolume } satisfies FolderSource,
  }
}

export function manifestOf(ctx: Context, hq: StoredHq | null, site: StoredSite): Manifest {
  const siteCredential = site.hqUrl ? readSiteCredential(ctx.state) : null
  return { hq, site, secrets: installSecrets(ctx.state), console: consoleHere(ctx)?.settings ?? null, siteCredential }
}

/** The records of a backup of what `manifest` says the site carries, each part streamed as it is read. */
export async function* backupRecords(io: BackupIO, names: InstallNames, paths: MachinePaths, manifest: Manifest): AsyncGenerator<SealedRecord> {
  const src = sources(names, paths)
  async function* part(name: string, bytes: Bytes): AsyncGenerator<SealedRecord> {
    yield { type: 'begin', name }
    for await (const chunk of bytes) yield { type: 'data', bytes: chunk }
    yield { type: 'end' }
  }
  yield* part(PART.manifest, (async function* () { yield Buffer.from(JSON.stringify(manifest), 'utf8') })())
  if (manifest.hq) {
    yield* part(PART.hqDatabase, io.dumpDatabase(src[PART.hqDatabase].container, src[PART.hqDatabase].database))
    yield* part(PART.hqStorage, io.readFolder(src[PART.hqStorage]))
  }
  yield* part(PART.siteDatabase, io.dumpDatabase(src[PART.siteDatabase].container, src[PART.siteDatabase].database))
  yield* part(PART.siteData, io.readFolder(src[PART.siteData]))
  if (manifest.console) yield* part(PART.consoleState, io.readFolder(src[PART.consoleState]))
}

/**
 * Reads a backup's records one part at a time: `on` is given each part's name and its bytes, and must read them
 * to the end (or not at all: what it leaves is skipped).
 */
export async function eachPart(records: AsyncIterator<SealedRecord>, on: (name: string, bytes: Bytes) => Promise<void>): Promise<void> {
  for (;;) {
    const next = await records.next()
    if (next.done) return
    if (next.value.type !== 'begin') throw new DamagedBackup('a part of it has no name')
    let ended = false
    const body = (async function* () {
      for (;;) {
        const r = await records.next()
        if (r.done) throw new DamagedBackup('it ends partway through a part')
        if (r.value.type === 'end') {
          ended = true
          return
        }
        if (r.value.type !== 'data') throw new DamagedBackup('a part of it begins inside another')
        yield r.value.bytes
      }
    })()
    await on(next.value.name, body)
    if (!ended) for await (const _ of body) { /* skipped */ }
  }
}

/** The manifest, from the first part of a backup's records. */
export async function readManifest(records: AsyncIterator<SealedRecord>): Promise<Manifest> {
  const first = await records.next()
  if (first.done || first.value.type !== 'begin' || first.value.name !== PART.manifest) throw new DamagedBackup('it does not begin with what it holds')
  const chunks: Buffer[] = []
  for (;;) {
    const r = await records.next()
    if (r.done) throw new DamagedBackup('it ends partway through a part')
    if (r.value.type === 'end') break
    if (r.value.type !== 'data') throw new DamagedBackup('a part of it begins inside another')
    chunks.push(r.value.bytes)
  }
  let m: Partial<Manifest>
  try {
    m = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<Manifest>
  } catch {
    throw new DamagedBackup('what it holds is not readable')
  }
  if (!m.site || typeof m.site.name !== 'string' || !m.secrets || typeof m.secrets.hqMasterKey !== 'string') {
    throw new DamagedBackup('what it holds is not readable')
  }
  const siteCredential = typeof m.siteCredential === 'string' && /^[\x21-\x7e]{32,512}$/.test(m.siteCredential) ? m.siteCredential : null
  return { hq: m.hq ?? null, site: m.site, secrets: m.secrets, console: m.console ?? null, siteCredential }
}
