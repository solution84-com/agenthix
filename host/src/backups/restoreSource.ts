/**
 * Where a restore reads from (spec §12): a backup on this machine, or a sealed file in a folder on it — the
 * backup location, or wherever an export was put. A path whose last name has a dot is one file; otherwise it is a
 * folder whose backups are listed, newest first, from their headers, which are readable without a key.
 */
import path from 'node:path'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { folderProblem, type Bytes } from './io'
import { CLOUD_LOCATION_DIR, CLOUD_LOCATION_LABEL } from './cloudLocation'
import { machineHolder, parseLocationKey } from './keys'
import { holderFrom, openBackup, readHeader, WrongKey, type BackupHeader, type Holder, type SealedRecord } from './seal'
import { readManifest, type Manifest } from './parts'
import { BackupStore, isBackupFileName } from './store'
import { isPublishedVersion } from '@agenthix/core'
import { compare } from '../upgrades/versions'

export type SourceRef = { kind: 'machine'; name: string } | { kind: 'folder'; dir: string; name: string }

export type Listed = { name: string; header: BackupHeader; sizeBytes: number }

export function bytesOf(ctx: Context, ref: SourceRef): Bytes {
  return ref.kind === 'machine' ? new BackupStore(ctx.state).bytes(ref.name) : ctx.backupIO.folder.read(ref.dir, ref.name)
}

/** The backups at a path on the machine, newest first; one when it names a file. */
export async function listAt(ctx: Context, from: string): Promise<{ dir: string; backups: Listed[] }> {
  const problem = from === CLOUD_LOCATION_DIR ? null : folderProblem(from)
  if (problem) throw new Refusal('malformed', `Nothing can be restored from ${from}: ${problem}.`)
  const isFile = path.posix.basename(from).includes('.')
  const dir = isFile ? path.posix.dirname(from) : from.replace(/\/+$/, '')
  let files: { name: string; sizeBytes: number }[]
  try {
    files = await ctx.backupIO.folder.list(dir)
  } catch {
    throw new Refusal('not_found', dir === CLOUD_LOCATION_DIR
      ? `The backup location ${CLOUD_LOCATION_LABEL} cannot be read now. Try again when Agenthix Cloud has sent new credentials.`
      : `${dir} cannot be read on ${ctx.machine.name}. Check the folder is mounted, then run this again.`)
  }
  const wanted = isFile ? files.filter(f => f.name === path.posix.basename(from)) : files.filter(f => isBackupFileName(f.name))
  if (isFile && wanted.length === 0) throw new Refusal('not_found', `There is no file ${from} on ${ctx.machine.name}.`)
  const backups: Listed[] = []
  for (const f of wanted) {
    try {
      backups.push({ name: f.name, sizeBytes: f.sizeBytes, header: await readHeader(ctx.backupIO.folder.read(dir, f.name)) })
    } catch (err) {
      if (isFile) throw new Refusal('malformed', `${from} is not a backup this host service can read: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (backups.length === 0) throw new Refusal('not_found', `There are no backups in ${dir === CLOUD_LOCATION_DIR ? `the backup location ${CLOUD_LOCATION_LABEL}` : dir}.`)
  return { dir, backups: backups.sort((a, b) => b.header.takenAt.localeCompare(a.header.takenAt)) }
}

/** `a` against `b`: 1 when newer, a pre-release before its release. A development build (`dev`) counts as newer than any. */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0
  if (a === 'dev') return 1
  if (b === 'dev') return -1
  if (isPublishedVersion(a) && isPublishedVersion(b)) return Math.sign(compare(a, b))
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1
  return 0
}

export type Checked = { header: BackupHeader; manifest: Manifest; records: AsyncGenerator<SealedRecord> }

/**
 * Opens a backup and checks it before anything changes: the key opens it, it is of this install's namespace, and
 * it was not taken from a newer version than this host service runs. `key` is the person's, for a copy in a
 * folder; a backup on the machine opens with the machine's own.
 */
export async function openChecked(ctx: Context, ref: SourceRef, key?: string): Promise<Checked> {
  let holder: Holder
  if (ref.kind === 'machine') holder = machineHolder(ctx.state)
  else {
    const bytes = key ? parseLocationKey(key) : null
    if (!bytes) throw new Refusal('malformed', 'That is not a key: a key is six groups of four letters and digits, as it was shown. Nothing was changed.')
    holder = holderFrom(bytes)
  }
  let opened
  try {
    opened = await openBackup(bytesOf(ctx, ref), holder)
  } catch (err) {
    if (err instanceof WrongKey) {
      throw new Refusal('conflict', 'That key does not open this backup. Nothing was changed. Use the key shown when the backup location was set, or when the export was made.')
    }
    throw new Refusal('failed', `${err instanceof Error ? err.message : String(err)} Nothing was changed.`)
  }
  const { header, records } = opened
  if (header.namespace !== ctx.names.namespace) {
    await records.return(undefined)
    throw new Refusal('conflict', `This backup is of an install named "${header.namespace}", and this machine's is "${ctx.names.namespace}"; restoring it here would mix the two. Nothing was changed.`)
  }
  if (compareVersions(header.version, ctx.machine.hostServiceVersion) > 0) {
    await records.return(undefined)
    throw new Refusal('conflict', `This backup was taken from version ${header.version}, newer than this host service's ${ctx.machine.hostServiceVersion}. Upgrade the host service to ${header.version} or later, then restore. Nothing was changed.`)
  }
  let manifest: Manifest
  try {
    manifest = await readManifest(records)
  } catch (err) {
    await records.return(undefined)
    throw new Refusal('failed', `${err instanceof Error ? err.message : String(err)} Nothing was changed.`)
  }
  return { header, manifest, records }
}
