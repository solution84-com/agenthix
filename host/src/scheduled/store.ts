/**
 * The scheduled changes this host service holds (host-management spec §6, §14), in `scheduled.json` in its state
 * folder, so a change outlives a restart of the host service. Each entry keeps the change, the request it runs, and
 * the latest notice about it until hq has it.
 *
 * Every read-change-write goes through `withStore`, one at a time, so the scheduler's tick and a person scheduling
 * at the same moment never overwrite each other.
 */
import crypto from 'node:crypto'
import type { ChangeRequest, ScheduledChange, ScheduledChangeNotice } from '@agenthix/core'
import type { StateFolder } from '../state/folder'

export type ScheduledEntry = {
  change: ScheduledChange
  request: ChangeRequest
  /** The latest notice about it; a newer one replaces it, since hq needs only the newest. */
  notice: ScheduledChangeNotice | null
  /** Whether hq took the notice through its control socket. A site passes notices on and is not asked. */
  delivered: boolean
  /** Whether the latest notice went to the pinned Fleet Console over the link; it reads them again with the figures. */
  toldConsole?: boolean
  /**
   * What the change is for: the `installedAt` of the HQ or site it targets when it was scheduled. Once that install
   * is gone — erased, removed, moved away, or replaced by a new one — the change ends as cancelled (`ends.ts`).
   */
  owner?: string
  /** When it ended — done, rolled back, cancelled or missed (ISO); null while it is ahead or running. */
  endedAt: string | null
}

export type ScheduledFile = {
  /** Stands for this machine in a change until the machine has a key of its own to fingerprint. */
  machineId: string
  nextId: number
  entries: ScheduledEntry[]
}

const FILE = 'scheduled.json'
/** An ended change stays this long, so its last notice still reaches hq through a site that was away. */
export const ENDED_KEPT_MS = 24 * 60 * 60_000

function read(state: StateFolder): ScheduledFile {
  const stored = state.readJson(FILE) as Partial<ScheduledFile> | null
  return {
    machineId: typeof stored?.machineId === 'string' ? stored.machineId : crypto.randomBytes(32).toString('hex'),
    nextId: typeof stored?.nextId === 'number' && stored.nextId > 0 ? stored.nextId : 1,
    entries: Array.isArray(stored?.entries) ? stored.entries : [],
  }
}

const chains = new Map<string, Promise<unknown>>()

/** Runs `work` on the file alone; what it leaves in the file is written back whole. Never runs a change inside. */
export function withStore<T>(state: StateFolder, work: (file: ScheduledFile) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const file = read(state)
    const result = await work(file)
    state.writeJson([FILE], file)
    return result
  }
  const next = (chains.get(state.root) ?? Promise.resolve()).then(run, run)
  chains.set(state.root, next)
  void next.finally(() => { if (chains.get(state.root) === next) chains.delete(state.root) }).catch(() => {})
  return next
}

/** The file as it is now, for reading only. */
export function readStore(state: StateFolder): ScheduledFile {
  return read(state)
}

export function prune(file: ScheduledFile, now: Date): void {
  file.entries = file.entries.filter(e => !e.endedAt || now.getTime() - Date.parse(e.endedAt) < ENDED_KEPT_MS)
}
