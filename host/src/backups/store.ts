/**
 * What the host service keeps about backups in its state folder (spec §6, §12): the sealed nightly backups
 * themselves, the backup location and the public key of whoever set it, the fleet's backup time, and how the last
 * backup, copy and export went — which `status` reports.
 */
import fs from 'node:fs'
import type { BackupSummary } from '@agenthix/core'
import type { StateFolder } from '../state/folder'
import { readHeader, type BackupHeader } from './seal'

/** Kept on the machine: the last 14 nights, as the backups board draws (two weeks to notice a mistake or a bad upgrade). */
export const NIGHTS_KEPT = 14
/**
 * Kept in the backup location: the last 30 nights. The copy there is the one that outlives the machine, and its
 * space is the organisation's own; a month covers a problem noticed late, such as a deletion found at month's end.
 */
export const LOCATION_NIGHTS_KEPT = 30
const DAY_MS = 24 * 3600_000

export const SUFFIX = '.sealed'
/** `<machine>-<when>-<kind>-<id>.sealed`: the machine first, so machines that share a backup location keep apart. */
const FILE = /^([a-z0-9][a-z0-9-]*)-(\d{8}T\d{6}Z)-([a-z]+)-([0-9a-f]{8})\.sealed$/

/** `setBy: 'cloud'`: Agenthix Cloud set it (cloudLocation.ts), and `path` is the marker that routes to its store. */
export type LocationSetting = { path: string; publicKey: string; setAt: string; setBy?: 'cloud' }
export type BackupTime = { hour: number; minute: number }
export type BackupLog = {
  last?: { at: string; ok: boolean; id?: string; sizeBytes?: number; error?: string }
  copy?: { at: string; ok: boolean; path: string; error?: string }
  lastExportAt?: string
  /** The last night a nightly backup was tried, so each night is tried once. */
  triedNight?: string
}

/**
 * Whose backups the log tells of: the HQ and site on the machine, by when each was installed — kept through an
 * upgrade, a restore and a move, and new for a new install. Null when neither is installed.
 */
function logOwner(state: StateFolder): string | null {
  const at = (part: string) => {
    const v = (state.readJson(part, 'settings.json') as { installedAt?: unknown } | null)?.installedAt
    return typeof v === 'string' ? v : null
  }
  const hq = at('hq')
  const site = at('site')
  return hq || site ? `${hq ?? ''}|${site ?? ''}` : null
}

export const fileMachine = (machine: string) => machine.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '') || 'machine'

const FILE_KIND: Record<BackupHeader['kind'], string> = { nightly: 'nightly', now: 'now', beforeRestore: 'restore', beforeUpgrade: 'upgrade' }

export const fileNameOf = (h: Pick<BackupHeader, 'machine' | 'takenAt' | 'kind' | 'id'>) =>
  `${fileMachine(h.machine)}-${h.takenAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${FILE_KIND[h.kind]}-${h.id}${SUFFIX}`

export const isBackupFileName = (name: string) => FILE.test(name)

/** The id a backup's file name ends with; null when the name is not a backup's. */
export const backupIdOfFileName = (name: string): string | null => FILE.exec(name)?.[4] ?? null

/** This machine's nightly backups among a folder's file names, newest first. */
export function nightlyOf(machine: string, names: string[]): string[] {
  const mine = fileMachine(machine)
  return names.filter(n => {
    const m = FILE.exec(n)
    return m !== null && m[1] === mine && m[3] === 'nightly'
  }).sort().reverse()
}

export function summaryOf(h: BackupHeader, sizeBytes: number, inLocation: boolean): BackupSummary {
  return { id: h.id, night: h.night, takenAt: h.takenAt, sizeBytes, holds: h.holds, inLocation }
}

async function* fileBytes(file: string, limit?: number): AsyncGenerator<Buffer> {
  const stream = fs.createReadStream(file, limit ? { end: limit - 1 } : {})
  for await (const chunk of stream) yield chunk as Buffer
}

export class BackupStore {
  constructor(private readonly state: StateFolder) {}

  dir(): string {
    return this.state.folder('backups', 'nightly')
  }

  path(name: string): string {
    return `${this.dir()}/${name}`
  }

  bytes(name: string): AsyncGenerator<Buffer> {
    return fileBytes(this.path(name))
  }

  /** Every backup on the machine, newest first, each with its header. A file that is not one is left alone. */
  async list(): Promise<{ name: string; header: BackupHeader; sizeBytes: number }[]> {
    const out: { name: string; header: BackupHeader; sizeBytes: number }[] = []
    for (const name of fs.readdirSync(this.dir()).filter(isBackupFileName)) {
      try {
        const header = await readHeader(fileBytes(this.path(name), 128 * 1024))
        out.push({ name, header, sizeBytes: fs.statSync(this.path(name)).size })
      } catch {
        // Not readable as a backup: neither listed nor removed.
      }
    }
    return out.sort((a, b) => b.header.takenAt.localeCompare(a.header.takenAt))
  }

  async find(id: string): Promise<{ name: string; header: BackupHeader; sizeBytes: number } | null> {
    return (await this.list()).find(b => b.header.id === id) ?? null
  }

  /** The nightly backups beyond the last `NIGHTS_KEPT`; one taken by hand, or before a restore or an upgrade, after as many days. */
  async prune(now: Date): Promise<string[]> {
    const all = await this.list()
    const nightly = all.filter(b => b.header.kind === 'nightly')
    const old = new Set(nightly.slice(NIGHTS_KEPT).map(b => b.name))
    for (const b of all) {
      if (b.header.kind !== 'nightly' && now.getTime() - Date.parse(b.header.takenAt) > NIGHTS_KEPT * DAY_MS) old.add(b.name)
    }
    for (const name of old) fs.rmSync(this.path(name), { force: true })
    return [...old]
  }

  location(): LocationSetting | null {
    const v = this.state.readJson('backups', 'location.json') as Partial<LocationSetting> | null
    if (!v || typeof v.path !== 'string' || typeof v.publicKey !== 'string' || typeof v.setAt !== 'string') return null
    return v.setBy === 'cloud' ? { path: v.path, publicKey: v.publicKey, setAt: v.setAt, setBy: 'cloud' } : { path: v.path, publicKey: v.publicKey, setAt: v.setAt }
  }

  setLocation(setting: LocationSetting): void {
    this.state.writeJson(['backups', 'location.json'], setting)
  }

  /** The fleet's backup time (spec §12), 02:00 until it is set. */
  time(): BackupTime {
    const v = this.state.readJson('backups', 'time.json') as Partial<BackupTime> | null
    const ok = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < max
    return v && ok(v.hour, 24) && ok(v.minute, 60) ? { hour: v.hour, minute: v.minute } : { hour: 2, minute: 0 }
  }

  /**
   * How the last backup, copy and export went, for what is installed now. A log written for an HQ or site the
   * machine ran before is not this one's: a new install starts with none.
   */
  log(): BackupLog {
    const v = this.state.readJson('backups', 'log.json') as (BackupLog & { owner?: unknown }) | null
    if (!v || v.owner !== logOwner(this.state)) return {}
    const { owner: _owner, ...log } = v
    return log
  }

  record(change: Partial<BackupLog>): void {
    this.state.writeJson(['backups', 'log.json'], { ...this.log(), ...change, owner: logOwner(this.state) })
  }
}
