/** How backups stand on this machine, for `status` and `backup location` (the CLI board's *agenthix status*). */
import { installed, type Context } from '../service/context'
import { anySuspended } from '../lifecycle/suspend'
import { locationLabel } from './cloudLocation'
import { BackupStore, type BackupLog, type BackupTime } from './store'

export type BackupsStatus = {
  time: BackupTime
  carriesHq: boolean
  last: BackupLog['last'] | null
  copy: BackupLog['copy'] | null
  location: { path: string; setAt: string; setByCloud?: boolean } | null
  lastExportAt: string | null
  /** HQ or the site is suspended, so the nightly backup waits. */
  suspended?: boolean
}

export function backupsStatus(ctx: Context): BackupsStatus | null {
  const here = installed(ctx)
  if (!here.site) return null
  const store = new BackupStore(ctx.state)
  const log = store.log()
  const location = store.location()
  return {
    time: store.time(),
    carriesHq: here.hq !== null,
    last: log.last ?? null,
    copy: log.copy ?? null,
    location: location ? { path: locationLabel(location), setAt: location.setAt, ...(location.setBy === 'cloud' ? { setByCloud: true } : {}) } : null,
    lastExportAt: log.lastExportAt ?? null,
    suspended: anySuspended(ctx),
  }
}
