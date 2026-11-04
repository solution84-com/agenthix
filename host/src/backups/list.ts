/**
 * `backup.list` (spec §12): the backups a restore on this machine can take — those it holds, and this machine's in its
 * backup location — newest first, each once. Only what a backup's header says to anyone, its size and where it is:
 * never a path, a file name or a key. A backup of something other than what runs here now (HQ's on a machine that
 * runs only a site, or the reverse) is left out, since it cannot be restored here.
 */
import type { BackupListed, BackupLocationRead, HostResults } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { listAt } from './restoreSource'
import type { BackupHeader } from './seal'
import { BackupStore, fileMachine, machineOfFileName } from './store'

function listed(h: BackupHeader, sizeBytes: number, where: 'machine' | 'location'): BackupListed {
  return {
    id: h.id, night: h.night, takenAt: h.takenAt, kind: h.kind, holds: h.holds, sizeBytes,
    onMachine: where === 'machine', inLocation: where === 'location',
  }
}

export async function listBackups(ctx: Context): Promise<HostResults['backup.list']> {
  const here = installed(ctx)
  const holdsHq = here.hq !== null
  const fits = (h: BackupHeader) => here.site !== null && h.holds.includes('hq') === holdsHq
  const store = new BackupStore(ctx.state)
  const byId = new Map<string, BackupListed>()
  for (const b of await store.list()) if (fits(b.header)) byId.set(b.header.id, listed(b.header, b.sizeBytes, 'machine'))

  let location: BackupLocationRead = 'none'
  const setting = store.location()
  if (setting) {
    try {
      const { backups } = await listAt(ctx, setting.path)
      location = 'read'
      // Machines may share a backup location: only this machine's, whose file names carry exactly its name.
      const mine = fileMachine(ctx.machine.name)
      for (const b of backups) {
        if (machineOfFileName(b.name) !== mine || !fits(b.header)) continue
        const known = byId.get(b.header.id)
        if (known) known.inLocation = true
        else byId.set(b.header.id, listed(b.header, b.sizeBytes, 'location'))
      }
    } catch (err) {
      // An empty folder is read, with nothing in it; any other refusal means it could not be read now.
      location = err instanceof Error && /^There are no backups in /.test(err.message) ? 'read' : 'unreadable'
    }
  }
  const backups = [...byId.values()].sort((a, b) => b.takenAt.localeCompare(a.takenAt))
  return { backups, location }
}
