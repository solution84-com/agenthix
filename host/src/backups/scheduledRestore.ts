/**
 * Restoring a night at a time (spec §12, §14): registered with the scheduler, so members are told from when it is
 * scheduled, as for any maintenance. Only a backup on the machine, which opens with the machine's own key: a copy in
 * the backup location needs its key, which is never kept for later (core refuses to schedule one).
 */
import fs from 'node:fs'
import type { BackupSource, HostTarget } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { registerScheduledChange } from '../scheduled/registry'
import { restoreHere } from './restore'
import { BackupStore, isBackupFileName } from './store'
import { nightOf } from './take'

/** How long a restore due now waits for a backup or another restore that holds the machine, such as the nightly one. */
const BUSY_WAIT_MS = 30 * 60_000
const BUSY_POLL_MS = 30_000

/** `<machine>-<when>-<kind>-<id>.sealed`: the file of a backup on the machine, and when it was taken, from its name alone. */
function onMachine(ctx: Context, backupId: string): { name: string; takenAt: Date } | null {
  const name = fs.readdirSync(new BackupStore(ctx.state).dir()).find(n => isBackupFileName(n) && n.endsWith(`-${backupId}.sealed`))
  const when = name ? /-(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z-[a-z]+-[0-9a-f]{8}\.sealed$/.exec(name) : null
  if (!name || !when) return null
  const [, y, mo, d, h, mi, s] = when
  return { name, takenAt: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`) }
}

/** A restore's target is what the backup holds: HQ, with its site, on HQ's machine; a site alone elsewhere. */
export function checkRestoreTarget(ctx: Context, target: HostTarget): void {
  const here = installed(ctx)
  if (target === 'site' && here.hq) throw new Refusal('conflict', `${ctx.machine.name} runs HQ: its site goes back with HQ, so choose HQ to restore it.`)
  if (target === 'hq' && !here.hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ, so there is no HQ to restore.`)
}

function machineSource(source: BackupSource): Extract<BackupSource, { from: 'machine' }> {
  if (source.from !== 'machine') throw new Refusal('conflict', 'Only a backup kept on the machine can be restored at a time; a copy in the backup location is restored now, with its key.')
  return source
}

registerScheduledChange('backup.restore', {
  kind: 'restore',
  target: r => r.target,
  detail: (ctx, r) => {
    const found = r.source.from === 'machine' ? onMachine(ctx, r.source.backupId) : null
    return found ? `night of ${nightOf(found.takenAt)}` : null
  },
  expectedMinutes: 10,
  check: (ctx, r) => {
    const { backupId } = machineSource(r.source)
    checkRestoreTarget(ctx, r.target)
    if (!onMachine(ctx, backupId)) throw new Refusal('not_found', `There is no such backup on ${ctx.machine.name}: it may have been removed as older nights are. Nothing was changed.`)
  },
  run: async (ctx, r) => {
    const { name } = onMachine(ctx, machineSource(r.source).backupId)!
    const until = ctx.now().getTime() + BUSY_WAIT_MS
    for (;;) {
      try {
        await restoreHere(ctx, { kind: 'machine', name }, undefined, () => {})
        return
      } catch (err) {
        if (!(err instanceof Refusal && err.code === 'busy') || ctx.now().getTime() >= until) throw err
        await ctx.sleep(BUSY_POLL_MS)
      }
    }
  },
})
