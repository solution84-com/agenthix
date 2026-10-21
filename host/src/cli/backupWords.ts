/**
 * How the CLI words backups (the CLI board's *agenthix status* and *Backups: the backup location and restoring*):
 * times relative to now where that reads better, sizes in GB, and the lines `status` adds under the site.
 */
import type { BackupsStatus } from '../backups/status'
import { cmd, nextStep, wrap } from './words'

const IN = '  '
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')

export const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`
export const fullDate = (d: Date) => `${dayMonth(d)} ${d.getFullYear()}`

/** `night of 12 October 2026` from a backup's night, `YYYY-MM-DD`. */
export function nightLabel(night: string): string {
  const [y, mo, d] = night.split('-').map(Number)
  return `night of ${fullDate(new Date(y, mo - 1, d))}`
}

export function size(bytes: number): string {
  if (bytes >= 100 * 1000 ** 2) return `${(bytes / 1000 ** 3).toFixed(1)} GB`
  if (bytes >= 1000 ** 2) return `${Math.round(bytes / 1000 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1000))} KB`
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** `02:00 last night`, `today 15:20`, `yesterday 15:20`, or `9 October 15:20`. */
export function when(iso: string, now: Date): string {
  const at = new Date(iso)
  const yesterday = new Date(now.getTime() - 24 * 3600_000)
  if (sameDay(at, now)) return at.getHours() < 6 ? `${clock(at)} last night` : `today ${clock(at)}`
  if (sameDay(at, yesterday)) return `yesterday ${clock(at)}`
  return `${dayMonth(at)} ${clock(at)}`
}

/** Calendar days, so a change of clocks in between does not shift the count. */
function daysAgo(iso: string, now: Date): string {
  const at = new Date(iso)
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(at.getFullYear(), at.getMonth(), at.getDate())) / (24 * 3600_000))
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

/** The backup lines `status` puts under the site. */
export function backupLines(b: BackupsStatus, now: Date): string[] {
  const time = `${pad(b.time.hour)}:${pad(b.time.minute)}`
  const lines: string[] = []
  const onlyHere = b.location ? '' : ' Kept on this machine only.'
  if (!b.last) lines.push(wrap(`No backup yet. The first is taken tonight at ${time}.${onlyHere}`, IN))
  else if (b.last.ok) {
    lines.push(wrap(`Last backup: ${when(b.last.at, now)}, ${size(b.last.sizeBytes ?? 0)}, sealed${b.carriesHq ? ' (HQ included)' : ''}.${onlyHere}`, IN))
  } else {
    lines.push(nextStep(`The last backup, ${when(b.last.at, now)}, failed: ${(b.last.error ?? 'no reason was given').replace(/\.?$/, '.')} The next is tried tonight at ${time}. To try now:`, cmd('backup'), IN))
  }
  if (b.suspended) lines.push(wrap('Nightly backups wait while it is suspended; they start again when it is resumed.', IN))
  if (b.location) {
    const where = b.location.setByCloud ? 'the backup location, which Agenthix Cloud set,' : `the backup location ${b.location.path}`
    const fix = b.location.setByCloud ? 'the next copy is tried with tonight\'s backup' : 'Check the folder is mounted; the next copy is tried with tonight\'s backup'
    if (b.copy && b.copy.path === b.location.path && b.copy.ok) lines.push(wrap(`Copied to ${where} at ${when(b.copy.at, now)}.`, IN))
    else if (b.copy && b.copy.path === b.location.path) {
      lines.push(wrap(`Not copied to ${where}: ${(b.copy.error ?? 'it could not be written').replace(/\.?$/, '')}. ${fix.charAt(0).toUpperCase()}${fix.slice(1)}.`, IN))
    } else lines.push(wrap(`Copies go to ${where} from the next backup.`, IN))
  } else {
    const exported = b.lastExportAt ? `The last export was ${daysAgo(b.lastExportAt, now)}.` : 'No export has been made.'
    lines.push(nextStep(`No backup location is set. If this machine is lost, so is this backup. ${exported} To choose a folder for copies:`, cmd('backup location <path>'), IN))
  }
  return lines
}
