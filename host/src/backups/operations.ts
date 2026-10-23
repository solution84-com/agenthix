/**
 * The backup operations, as the owner socket's dispatch calls them. Two kinds:
 *
 * - core's closed set (`backup.take`, `.list`, `.export`, `.exportRead`, `.exportDone`, `.store`, `.fetch`, `.restore`), which a
 *   controller may also ask;
 * - the machine's own (`BackupMachineRequest`): setting the backup location, saving a key to a file, exporting to a
 *   folder, and restoring a machine from a folder. These are never in core's set, so no controller can ask them —
 *   above all, nothing but the machine itself can choose where copies go (adr-0112).
 */
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { BackupSummary, HostRequest } from '@agenthix/core'
import type { Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { exportBackup, type ExportResult } from './export'
import { readHeldExport, releaseHeldExport } from './exportDownload'
import { machineHolder, parseLocationKey } from './keys'
import { confirmLocation, prepareLocation, saveKeyFile } from './location'
import { refuseWhereSomethingRuns, restoreHere, restoreOnNewMachine, type RestoreResult } from './restore'
import { listAt, openChecked, type Listed, type SourceRef } from './restoreSource'
import { holderFrom, rewrapBackup, WrongKey } from './seal'
import { BackupStore, summaryOf } from './store'
import { backupsStatus } from './status'
import { copyToLocation, exclusive, takeBackup } from './take'
import { prepareJoinedRestore, runJoinedRestore } from './joinedRestore'
import { checkRestorable } from './siteRestore'
import { readPin } from '../link/pin'
import { listBackups } from './list'
import { checkRestoreTarget } from './scheduledRestore'
import { portFields, type PortChoice } from '../install/ports'

export type BackupMachineRequest =
  | { op: 'backup.status' }
  | { op: 'backup.location'; path: string }
  | { op: 'backup.locationConfirm'; pendingId: string }
  | { op: 'backup.saveKey'; key: string; label: 'location' | 'export' }
  | { op: 'backup.exportNow'; to?: string }
  | { op: 'restore.list'; from: string }
  /** With HQ's address and a code from *Restore from a backup…*: also keeps the restore for the connect that follows. */
  | { op: 'restore.check'; from: string; name: string; key: string; address?: string; code?: string }
  /** `hqPort`, `consolePort`: the ports HQ and its Fleet Console take on this machine, from `restore --hq-port` and `--console-port`. */
  | ({ op: 'restore.run'; from: string; name: string; key: string } & PortChoice)

export const BACKUP_MACHINE_OPS = [
  'backup.status', 'backup.location', 'backup.locationConfirm', 'backup.saveKey', 'backup.exportNow',
  'restore.list', 'restore.check', 'restore.run',
] as const

export type RestoreListResult = { dir: string; backups: Listed[] }

/** What `restore.check` says a restore would bring back, once the key, namespace and version pass. */
export type RestoreCheckResult = { machine: string; siteName: string; hqAddress: string | null; night: string; takenAt: string; holds: string[] }

const CONTROL = /[\u0000-\u001f\u007f]/

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max && !CONTROL.test(v) ? v.trim() : null
}

/** The machine's own backup requests, rebuilt field by field; null when the op is not one of them. */
export function parseBackupMachineRequest(r: Record<string, unknown>): BackupMachineRequest | 'malformed' | null {
  switch (r.op) {
    case 'backup.status':
      return { op: r.op }
    case 'backup.location': {
      const path = text(r.path, 1024)
      return path ? { op: r.op, path } : 'malformed'
    }
    case 'backup.locationConfirm': {
      const pendingId = text(r.pendingId, 64)
      return pendingId ? { op: r.op, pendingId } : 'malformed'
    }
    case 'backup.saveKey': {
      const key = text(r.key, 64)
      return key && (r.label === 'location' || r.label === 'export') ? { op: r.op, key, label: r.label } : 'malformed'
    }
    case 'backup.exportNow': {
      if (r.to === undefined) return { op: r.op }
      const to = text(r.to, 1024)
      return to ? { op: r.op, to } : 'malformed'
    }
    case 'restore.list': {
      const from = text(r.from, 1024)
      return from ? { op: r.op, from } : 'malformed'
    }
    case 'restore.check':
    case 'restore.run': {
      const from = text(r.from, 1024)
      const name = text(r.name, 255)
      const key = text(r.key, 64)
      if (!from || !name || name.includes('/') || !key) return 'malformed'
      if (r.op === 'restore.run') {
        const ports = portFields(r, ['hqPort', 'consolePort'])
        return ports ? { op: r.op, from, name, key, ...ports } : 'malformed'
      }
      if (r.address === undefined && r.code === undefined) return { op: r.op, from, name, key }
      const address = text(r.address, 512)
      const code = text(r.code, 32)
      return address && code ? { op: r.op, from, name, key, address, code } : 'malformed'
    }
    default:
      return null
  }
}

/** A machine answers one Fleet Console: one that already does is not joined again to restore a site. */
function refuseWherePinned(ctx: Context): void {
  if (readPin(ctx.state)) {
    throw new Refusal('conflict', `Not restored: ${ctx.machine.name} is already managed by a Fleet Console. A lost site is restored onto a machine that joins with the code from Restore from a backup…; to use this one, first: ${cmd('console disconnect')}`)
  }
}

async function onMachine(ctx: Context, id: string) {
  const found = await new BackupStore(ctx.state).find(id)
  if (!found) throw new Refusal('not_found', 'There is no such backup on this machine.')
  return found
}

function locationOrRefuse(ctx: Context) {
  const location = new BackupStore(ctx.state).location()
  if (!location) throw new Refusal('not_found', `No backup location is set for ${ctx.machine.name}. On the machine, run: ${cmd('backup location <path>')}`)
  return location
}

async function inLocation(ctx: Context, id: string): Promise<{ ref: SourceRef; sizeBytes: number }> {
  const { path } = locationOrRefuse(ctx)
  const { dir, backups } = await listAt(ctx, path)
  const found = backups.find(b => b.header.id === id)
  if (!found) throw new Refusal('not_found', 'There is no such backup in the backup location.')
  return { ref: { kind: 'folder', dir, name: found.name }, sizeBytes: found.sizeBytes }
}

export async function backupOperation(
  ctx: Context,
  request: Extract<HostRequest, { op: `backup.${string}` }>,
  progress: (p: Progress) => void,
): Promise<unknown> {
  switch (request.op) {
    case 'backup.take':
      return { backup: await exclusive('backup', () => takeBackup(ctx, 'now')) }
    case 'backup.list':
      return listBackups(ctx)
    case 'backup.export': {
      const found = await onMachine(ctx, request.backupId)
      const r = await exportBackup(ctx, found.name, 'held')
      return { exportId: r.exportId, sizeBytes: r.sizeBytes, key: r.key }
    }
    case 'backup.exportRead':
      return readHeldExport(ctx, request.exportId, request.offset)
    case 'backup.exportDone':
      return releaseHeldExport(ctx, request.exportId)
    case 'backup.store': {
      const found = await onMachine(ctx, request.backupId)
      locationOrRefuse(ctx)
      const store = new BackupStore(ctx.state)
      if (!(await copyToLocation(ctx, store, found.name))) {
        throw new Refusal('failed', `The copy could not be written to the backup location: ${store.log().copy?.error ?? 'unknown'}`)
      }
      return { backup: summaryOf(found.header, found.sizeBytes, true) }
    }
    case 'backup.fetch':
      return { backup: await fetchFromLocation(ctx, request.backupId, request.key) }
    case 'backup.restore': {
      const source = request.source
      if (source.from === 'transfer') throw new Refusal('conflict', 'A move is not restored by itself: a fleet admin chooses Move site… or Move HQ… in the Fleet Console, and the new machine restores what it is passed.')
      if (source.from === 'joined') {
        const r = await runJoinedRestore(ctx, progress)
        const backup: BackupSummary = { id: r.backupId, night: r.night, takenAt: r.takenAt, sizeBytes: r.sizeBytes, holds: ['site'], inLocation: false }
        return { backup, siteName: r.siteName, executionSiteId: r.executionSiteId }
      }
      checkRestoreTarget(ctx, request.target)
      const { ref, sizeBytes } = source.from === 'machine'
        ? await onMachine(ctx, source.backupId).then(f => ({ ref: { kind: 'machine', name: f.name } as SourceRef, sizeBytes: f.sizeBytes }))
        : await inLocation(ctx, source.backupId)
      const r = await restoreHere(ctx, ref, source.from === 'location' ? source.key : undefined, progress)
      const backup: BackupSummary = { id: source.backupId, night: r.night, takenAt: r.takenAt, sizeBytes, holds: r.holds, inLocation: source.from === 'location' }
      return { backup }
    }
  }
}

/** A copy in the backup location, brought onto the machine and sealed again to the machine's own key. */
async function fetchFromLocation(ctx: Context, id: string, key: string): Promise<BackupSummary> {
  const { ref } = await inLocation(ctx, id)
  if (ref.kind !== 'folder') throw new Refusal('not_found', 'There is no such backup in the backup location.')
  const secret = parseLocationKey(key)
  if (!secret) throw new Refusal('malformed', 'That is not a key: a key is six groups of four letters and digits, as it was shown.')
  const store = new BackupStore(ctx.state)
  const tmp = store.path(`.${ref.name}.part`)
  try {
    const { header, bytes } = await rewrapBackup(ctx.backupIO.folder.read(ref.dir, ref.name), holderFrom(secret), machineHolder(ctx.state).publicKey)
    await pipeline(Readable.from(bytes), fs.createWriteStream(tmp, { mode: 0o600 }))
    fs.renameSync(tmp, store.path(ref.name))
    return summaryOf(header, fs.statSync(store.path(ref.name)).size, true)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    if (err instanceof WrongKey) throw new Refusal('conflict', 'That key does not open this backup. Use the key shown when the backup location was set.')
    throw err
  }
}

export async function machineBackupOperation(ctx: Context, request: BackupMachineRequest, progress: (p: Progress) => void): Promise<unknown> {
  switch (request.op) {
    case 'backup.status':
      return backupsStatus(ctx)
    case 'backup.location':
      return prepareLocation(ctx, request.path, progress)
    case 'backup.locationConfirm':
      return confirmLocation(ctx, request.pendingId)
    case 'backup.saveKey':
      return saveKeyFile(ctx, request.key, request.label)
    case 'backup.exportNow':
      return exclusive('backup', async (): Promise<ExportResult> => {
        progress({ event: 'step', step: 'Taking a sealed backup now' })
        const taken = await takeBackup(ctx, 'now')
        progress({ event: 'stepDone', outcome: 'done' })
        const found = await onMachine(ctx, taken.id)
        return exportBackup(ctx, found.name, request.to ? { to: request.to } : 'exports')
      })
    case 'restore.list':
      refuseWhereSomethingRuns(ctx)
      return listAt(ctx, request.from) satisfies Promise<RestoreListResult>
    case 'restore.check': {
      refuseWhereSomethingRuns(ctx)
      const { dir, backups } = await listAt(ctx, request.from)
      const ref: SourceRef = { kind: 'folder', dir, name: request.name }
      const checked = await openChecked(ctx, ref, request.key)
      await checked.records.return(undefined)
      const h = checked.header
      if (request.code) {
        refuseWherePinned(ctx)
        checkRestorable(ctx, checked)
        const sizeBytes = backups.find(b => b.name === request.name)?.sizeBytes ?? 0
        prepareJoinedRestore(ctx, request.code, { ref, key: request.key, claim: { siteName: h.siteName, takenAt: h.takenAt }, sizeBytes })
      }
      return { machine: h.machine, siteName: h.siteName, hqAddress: h.hqAddress, night: h.night, takenAt: h.takenAt, holds: h.holds } satisfies RestoreCheckResult
    }
    case 'restore.run': {
      const { dir } = await listAt(ctx, request.from)
      return restoreOnNewMachine(ctx, { kind: 'folder', dir, name: request.name }, request.key, progress, { hqPort: request.hqPort, consolePort: request.consolePort }) satisfies Promise<RestoreResult>
    }
  }
}
