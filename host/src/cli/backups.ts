/**
 * The CLI's backup commands (the CLI board's *Backups: the backup location and restoring*): `backup`,
 * `backup export`, `backup location` and `restore --from`. A key is shown once; the person may save it to a
 * small file, and nothing is set until they say they have stored it.
 */
import type { BackupSummary } from '@agenthix/core'
import type { ExportResult } from '../backups/export'
import type { LocationPrepared } from '../backups/location'
import type { RestoreCheckResult, RestoreListResult } from '../backups/operations'
import type { RestoreResult } from '../backups/restore'
import type { Command } from './commands'
import { clock, dayMonth, fullDate, nightLabel, size, when } from './backupWords'
import type { StatusWithBackups } from './statusText'
import { cmd, nextStep, stepLine, wrap } from './words'
import type { ConnectResult } from '../link/manage'
import { restoreSiteDone, restoreSiteNeedsCode, restoreSiteWhat } from './restoreSiteWords'

export type Ask = <T>(request: unknown) => Promise<T>
export type BackupIo = {
  out: (text: string) => void
  ask: (prompt: string) => Promise<string | null>
  confirm: (question: string) => Promise<boolean>
}

async function showKey(call: Ask, io: BackupIo, key: string, label: 'location' | 'export'): Promise<boolean> {
  io.out(`  Key: ${key}`)
  if (await io.confirm('Save it to a file instead?')) {
    const { file } = await call<{ file: string }>({ op: 'backup.saveKey', key, label })
    io.out(wrap(`Saved to ${file}, readable only by this machine's admins. Copy it somewhere apart from the backups, then remove it from this machine.`))
  }
  return io.confirm('Have you stored the key?')
}

export async function backupNow(call: Ask, io: BackupIo): Promise<number> {
  const { backup } = await call<{ backup: BackupSummary }>({ op: 'backup.take' })
  const status = await call<StatusWithBackups>({ op: 'machine.status' })
  const where = status.backups?.location
  io.out(wrap(`Backed up: ${size(backup.sizeBytes)}, sealed${backup.holds.includes('hq') ? ' (HQ included)' : ''}.`))
  if (where) {
    io.out(wrap(backup.inLocation
      ? `Copied to the backup location ${where.path}.`
      : `Not copied to the backup location ${where.path}: ${status.backups?.copy?.error ?? 'it could not be written'}.${where.setByCloud ? '' : ' Check the folder is mounted.'}`))
  } else io.out(wrap('Kept on this machine only.'))
  return 0
}

export async function backupExport(call: Ask, io: BackupIo, to?: string): Promise<number> {
  const r = await call<ExportResult>({ op: 'backup.exportNow', to })
  io.out(wrap(`Exported, ${size(r.sizeBytes)}: ${r.file}`))
  io.out(wrap('It is sealed with a key made for this export, shown only now. Without it the file cannot be read, here or on another machine.'))
  if (await showKey(call, io, r.key, 'export')) return 0
  io.out(nextStep('Then the export cannot be opened. Make another when you can store its key:', cmd('backup export')))
  return 1
}

export async function backupLocation(call: Ask, io: BackupIo, path?: string): Promise<number> {
  const status = await call<StatusWithBackups>({ op: 'machine.status' })
  const machine = status.machine.name
  const b = status.backups
  if (!b) {
    io.out(nextStep(`No site runs on ${machine}, so there is nothing to back up. To install HQ and its site here:`, cmd('install')))
    return 1
  }
  const time = `${String(b.time.hour).padStart(2, '0')}:${String(b.time.minute).padStart(2, '0')}`
  if (!path) {
    if (b.location?.setByCloud) {
      io.out(`Backup location for ${machine}: ${b.location.path}.`)
      io.out(wrap(`Each nightly backup (${time}) is also written there, sealed to a key Agenthix Cloud keeps. It changes only through Agenthix Cloud.`))
    } else if (b.location) {
      io.out(`Backup location for ${machine}: ${b.location.path}`)
      io.out(wrap(`Each nightly backup (${time}) is also written there, sealed to the key shown when it was set.`))
    } else {
      io.out(`Backup location for ${machine}: not set.`)
      const exported = b.lastExportAt ? `The last export was ${when(b.lastExportAt, new Date())}.` : 'No export has been made.'
      io.out(nextStep(`Nightly backups (${time}) are kept on this machine only. ${exported} To choose a folder:`, cmd('backup location <path>')))
    }
    return 0
  }
  if (b.location?.setByCloud) {
    io.out(wrap(`The backup location of ${machine} is ${b.location.path}, so a folder cannot be chosen here.`))
    return 1
  }
  if (b.carriesHq) {
    io.out(`Backup location for ${machine}: ${path}`)
    io.out(wrap("This site carries HQ, so each nightly backup holds HQ too: its database, storage folder and secrets, as well as the site's workspaces."))
  } else io.out(`The folder, as this machine sees it: ${path}`)
  const prepared = await call<LocationPrepared>({ op: 'backup.location', path })
  io.out(wrap(`From tonight, each nightly backup of ${machine} (its database and workspaces${b.carriesHq ? ', and HQ' : ''}) is also written there, sealed. It is sealed with a key shown only now. Without it those copies cannot be read, here or on another machine.`))
  if (!(await showKey(call, io, prepared.key, 'location'))) {
    io.out('Not set. Nothing changed.')
    return 1
  }
  await call({ op: 'backup.locationConfirm', pendingId: prepared.pendingId })
  io.out(b.location && b.location.path !== path
    ? wrap(`Set. The copies already in ${b.location.path} stay there, sealed to the key shown when that folder was set.`)
    : 'Set.')
  return 0
}

function listLines(r: RestoreListResult): string[] {
  const machines = [...new Set(r.backups.map(x => x.header.machine))]
  const lines: string[] = []
  if (machines.length === 1) {
    const h = r.backups[0].header
    lines.push(`Backups of ${h.machine} (${h.holds.includes('hq') ? `HQ and its site ${h.siteName}` : `the site ${h.siteName}`}), newest first:`)
  } else lines.push('Backups here, newest first:')
  r.backups.forEach((x, i) => {
    const what = `${machines.length > 1 ? `${x.header.machine} · ` : ''}${nightLabel(x.header.night)}, ${clock(new Date(x.header.takenAt))}`
    lines.push(`  ${String(i + 1).padEnd(2)} ${what.padEnd(46)} ${size(x.sizeBytes)}`)
  })
  return lines
}

/** HQ's address and the code from *Restore from a backup…*, for a site other than HQ's (adr-0119). */
export type RestoreCode = { address: string; code: string }

export async function restoreFrom(call: Ask, io: BackupIo, from: string, join?: RestoreCode): Promise<number> {
  const status = await call<StatusWithBackups>({ op: 'machine.status' })
  const machine = status.machine.name
  const isFile = (from.split('/').pop() ?? '').includes('.')
  if (!isFile) io.out(`Looking in ${from} ...`)
  const listed = await call<RestoreListResult>({ op: 'restore.list', from })
  let chosen = listed.backups[0]
  if (isFile) {
    const at = new Date(chosen.header.takenAt)
    io.out(wrap(`This file is a backup of ${chosen.header.machine} taken on ${fullDate(at)}, ${clock(at)}. Its key is the one shown when it was made.`))
  } else {
    for (const line of listLines(listed)) io.out(line)
    const picked = await io.ask('Which night? [1] ')
    if (picked === null) return 1
    const n = picked.trim() ? Number(picked.trim()) : 1
    if (!Number.isInteger(n) || n < 1 || n > listed.backups.length) {
      io.out(`Not restored: there is no number ${picked.trim()} in the list.`)
      return 1
    }
    chosen = listed.backups[n - 1]
  }
  const site = !chosen.header.holds.includes('hq')
  if (site && !join) {
    io.out(restoreSiteNeedsCode(chosen.header.siteName, from))
    return 1
  }
  const key = await io.ask(isFile ? 'The key: ' : 'The key for these copies: ')
  if (key === null) return 1
  const checked = await call<RestoreCheckResult>({ op: 'restore.check', from, name: chosen.name, key, ...(site && join ? join : {}) })
  io.out(stepLine('Checking the key', 'passes'))
  if (site && join) {
    for (const line of restoreSiteWhat(machine, checked.siteName, checked.night, checked.takenAt)) io.out(line)
    if (!(await io.confirm('Restore?'))) {
      io.out('Not restored. Nothing changed.')
      return 1
    }
    io.out('')
    const r = await call<ConnectResult>({ op: 'console.connect', ...join })
    io.out('')
    if (!r.restored) return 1
    for (const line of restoreSiteDone(machine, r.restored)) io.out(line)
    return 0
  }
  const hq = checked.hqAddress ? `HQ at ${checked.hqAddress}, ` : ''
  io.out(wrap(`This brings back on ${machine}: ${hq}its site ${checked.siteName}, as they were then. It does not touch any other machine.`))
  if (!(await io.confirm('Restore?'))) {
    io.out('Not restored. Nothing changed.')
    return 1
  }
  io.out('')
  const r = await call<RestoreResult>({ op: 'restore.run', from, name: chosen.name, key })
  const taken = new Date(r.takenAt)
  io.out('')
  io.out(wrap(r.hqAddress && !/^https?:\/\/(localhost|127\.)/.test(r.hqAddress)
    ? `Restored. HQ answers on this machine once ${r.hqAddress} points at it. Other sites reconnect by themselves.`
    : `Restored. HQ answers at ${r.hqAddress}. Other sites reconnect by themselves.`))
  io.out(wrap(`Files changed after ${clock(taken)} on ${dayMonth(taken)} were lost with the machine. HQ will say so on each site as it reconnects.`))
  if (!r.hqAnswers) io.out(nextStep('HQ has not answered yet. To see how it is doing:', cmd('status')))
  return 0
}

export function backupCommand(command: Extract<Command, { kind: 'backupNow' | 'backupExport' | 'backupLocation' | 'restore' }>, call: Ask, io: BackupIo): Promise<number> {
  switch (command.kind) {
    case 'backupNow':
      return backupNow(call, io)
    case 'backupExport':
      return backupExport(call, io, command.to)
    case 'backupLocation':
      return backupLocation(call, io, command.path)
    case 'restore':
      return restoreFrom(call, io, command.from, command.address && command.code ? { address: command.address, code: command.code } : undefined)
  }
}
