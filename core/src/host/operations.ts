/**
 * The closed set of operations a controller — the Fleet Console, or the Cloud controller — may ask of a host service
 * (host-management spec §6). Nothing else is expressible: there is no shell, no Docker command and no file access
 * in this union, and `parseHostRequest` (operationParse.ts) refuses any `op` outside it.
 *
 * What stays on the machine is deliberately absent: setting the backup location, granting the fleet admin role, the
 * Fleet Console's one-time code, turning remote access on, admin links and password resets (spec §9, §12). Those are
 * the CLI's, through the owner socket, and are never offered to a controller.
 *
 * Every request travels sealed inside a `HostEnvelope` (envelope.ts), so hq relays it without reading it.
 */
import type { HostCeilings, HostFigures, HostTarget } from './figures.js'
import type { ScheduledBy, ScheduledChange } from './scheduledChange.js'
import type { HostIdentity } from './envelope.js'
import type { ExportChunk } from './exportDownload.js'

/** A published version, `major.minor.patch`. */
export type PublishedVersion = string

export type LogsReadRequest = {
  op: 'logs.read'
  target: HostTarget
  /** One service of the target (e.g. `hq-server`); all of them when absent. */
  service?: string
  /** Lines at or after this time (ISO). */
  since?: string
  limit?: number
}

export type InstallRequest =
  | { op: 'install'; target: 'hq'; version: PublishedVersion; address: string }
  /** The site is named after its machine, by the host service: no name is asked. */
  | { op: 'install'; target: 'site'; version: PublishedVersion }

/** Where a restore reads its backup from. */
export type BackupSource =
  | { from: 'machine'; backupId: string }
  | { from: 'location'; backupId: string; key: string }
  /** A backup another host service passed straight to this one, for a move (spec §13). */
  | { from: 'transfer'; transferId: string }
  /**
   * The backup the machine admin chose on this machine, and opened with the key they typed there, when it connected
   * with a code for restoring a lost site (adr-0119). Only a site; never scheduled. The key never leaves the machine.
   */
  | { from: 'joined' }

/** A change that can run now or be scheduled (spec §14); the same shapes `schedule` carries. */
export type ChangeRequest =
  | { op: 'upgrade'; target: HostTarget; version: PublishedVersion }
  | { op: 'capacity.set'; ceilings: HostCeilings }
  | { op: 'backup.restore'; target: HostTarget; source: BackupSource }
  | MoveRequest
  | EraseRequest
  | { op: 'suspend'; target: HostTarget }
  | { op: 'resume'; target: HostTarget }

/**
 * A move between machines (spec §13). The machine that holds the site sends; the new machine, connected with the
 * move's one-time code, receives. `peer` is the other machine's pinned fingerprint, and `peerIdentity` its keys,
 * vouched for by the Fleet Console that signs the request, since the two machines never pinned each other, and
 * `peerName` its machine's name, for the words people read. The same
 * `transferId` goes to both and to hq (`transfer.open`), and is spent by the one attempt. `target: 'hq'` moves hq
 * with its default site.
 */
export type MoveRequest =
  | {
      op: 'move'; role: 'send'; target: HostTarget; peer: string; peerIdentity: HostIdentity; peerName: string; transferId: string
      /** `target: 'hq'`: the address hq answers at once it runs on the new machine; absent, it keeps its address. */
      hqAddress?: string
    }
  | {
      op: 'move'; role: 'receive'; target: HostTarget; peer: string; peerIdentity: HostIdentity; peerName: string; transferId: string
      siteName: string
      hqAddress?: string
    }

/** Erasing hq needs its address typed in (spec §15); erasing a site is immediate and needs none. */
export type EraseRequest =
  | { op: 'erase'; target: 'hq'; confirmAddress: string }
  | { op: 'erase'; target: 'site' }

export type HostRequest =
  | { op: 'figures.read' }
  | LogsReadRequest
  | InstallRequest
  | { op: 'start'; target: HostTarget }
  | { op: 'stop'; target: HostTarget }
  | { op: 'remove'; target: HostTarget }
  | { op: 'backup.take' }
  /** The backups the machine holds and those in its backup location, newest first: read-only, nothing secret. */
  | { op: 'backup.list' }
  | { op: 'backup.export'; backupId: string }
  /** A chunk of an export the machine holds for the Fleet Console to download (exportDownload.ts). */
  | { op: 'backup.exportRead'; exportId: string; offset: number }
  /** The export was downloaded: the machine removes its copy. */
  | { op: 'backup.exportDone'; exportId: string }
  /** Write a copy of a backup to the backup location the machine admin set. */
  | { op: 'backup.store'; backupId: string }
  /** Read a backup back from the backup location onto the machine. */
  | { op: 'backup.fetch'; backupId: string; key: string }
  /** hq's address, or for a site the hq address it dials (`site hq-address`, spec §13). */
  | { op: 'address.set'; target: HostTarget; address: string }
  /**
   * `on` takes ports 80 and 443; it must be confirmed in so many words (spec §6). `certificate` and `privateKey` (PEM)
   * are accepted only from Cloud's controller: with them the front door serves that certificate and never tries ACME.
   */
  | { op: 'frontDoor.set'; on: true; confirmPorts: true; filesHost?: string; previewsHost?: string; certificate?: string; privateKey?: string }
  | { op: 'frontDoor.set'; on: false }
  | { op: 'schedule'; at: string; change: ChangeRequest }
  | { op: 'schedule.change'; changeId: string; at: string }
  | { op: 'schedule.cancel'; changeId: string }
  | ChangeRequest

export type HostOperation = HostRequest['op']

export const HOST_OPERATIONS = [
  'figures.read', 'logs.read', 'install', 'start', 'stop', 'remove', 'upgrade',
  'backup.take', 'backup.list', 'backup.export', 'backup.exportRead', 'backup.exportDone', 'backup.store', 'backup.fetch', 'backup.restore',
  'capacity.set', 'address.set', 'frontDoor.set', 'schedule', 'schedule.change', 'schedule.cancel',
  'suspend', 'resume', 'erase', 'move',
] as const satisfies readonly HostOperation[]

/** The operations a `schedule` may carry: the changes of spec §14. */
export const SCHEDULABLE_OPERATIONS = [
  'upgrade', 'capacity.set', 'backup.restore', 'move', 'erase', 'suspend', 'resume',
] as const satisfies readonly ChangeRequest['op'][]

export type LogLineFigure = { at: string; service: string; level: string; message: string }

export type BackupSummary = {
  id: string
  /** The night it belongs to, `YYYY-MM-DD`, so a restore can take the same night across machines (spec §12). */
  night: string
  takenAt: string
  sizeBytes: number
  holds: HostTarget[]
  inLocation: boolean
}

/**
 * One backup as `backup.list` answers it: what anyone may read of a backup without its key. Never a path, a file
 * name or a key: where it is, is only *on the machine* or *in the backup location*. A backup in both is listed once.
 */
export type BackupListed = {
  id: string
  night: string
  takenAt: string
  /** Why it was taken: each night, by hand, just before a restore, or just before an upgrade. */
  kind: 'nightly' | 'now' | 'beforeRestore' | 'beforeUpgrade'
  holds: HostTarget[]
  /** Its size on the machine, or in the backup location when it is only there. */
  sizeBytes: number
  /** Restored with the machine's own key. */
  onMachine: boolean
  /** Restored from there only with the key of whoever set the location. */
  inLocation: boolean
}

/** Whether the backup location was read for `backup.list`: none is set, it was read, or it could not be. */
export type BackupLocationRead = 'none' | 'read' | 'unreadable'

/** What each operation answers when it succeeds. */
export type HostResults = {
  'figures.read': HostFigures
  'logs.read': { lines: LogLineFigure[] }
  /**
   * For a site installed by a controller (spec §6, step 5): the hash of the credential the host service made for it,
   * which the Fleet Console registers with hq (`site.register`). The credential itself stays on the machine.
   */
  install: { state: 'started'; credentialHash?: string }
  start: { state: 'started' }
  stop: { state: 'stopped' }
  remove: { state: 'removed' }
  upgrade: { version: PublishedVersion; rolledBack: boolean }
  'backup.take': { backup: BackupSummary }
  'backup.list': { backups: BackupListed[]; location: BackupLocationRead }
  /** The export's key exists once, here, sealed to the controller that asked; the machine keeps no copy. */
  'backup.export': { exportId: string; sizeBytes: number; key: string }
  'backup.exportRead': ExportChunk
  'backup.exportDone': { removed: boolean }
  'backup.store': { backup: BackupSummary }
  'backup.fetch': { backup: BackupSummary }
  'backup.restore': { backup: BackupSummary }
  'capacity.set': { ceilings: HostCeilings }
  'address.set': { address: string }
  'frontDoor.set': { on: boolean }
  schedule: { change: ScheduledChange }
  'schedule.change': { change: ScheduledChange }
  'schedule.cancel': { change: ScheduledChange }
  suspend: { state: 'suspended' }
  resume: { state: 'started' }
  erase: { purgeAfter: string }
  move: { transferId: string }
}

export type HostRefusalCode =
  | 'unknown_operation'
  | 'malformed'
  | 'not_installed'
  | 'already_installed'
  | 'busy'
  | 'conflict'
  | 'not_found'
  | 'unsigned_image'
  | 'failed'

export type HostRefusal = {
  code: HostRefusalCode
  /** A sentence a person reads, with a next step where there is one. */
  message: string
}

export type HostResult<O extends HostOperation = HostOperation> =
  | { ok: true; op: O; result: HostResults[O] }
  | { ok: false; op: O | null; refusal: HostRefusal }

/**
 * On whose behalf a controller asks. The Fleet Console names the signed-in fleet admin; the CLI is the machine
 * admin. It is the controller's claim, carried inside the signed envelope, and is what the activity record and a
 * scheduled change's "who scheduled it" show. Never the maintenance window, which only the host service itself is.
 */
export type HostActor = Exclude<ScheduledBy, { kind: 'maintenanceWindow' }>
