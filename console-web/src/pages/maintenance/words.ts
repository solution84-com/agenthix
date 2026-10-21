/** How scheduled-change notices turn into the words on the Maintenance screen (boards *Scheduled*, *Changes flow*; spec §14). */
import type { ScheduledBy, ScheduledChange, ScheduledChangeNotice, ScheduledChangeState } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'
import type { FleetHost } from '../dashboard/types'
import { possessive } from '../dashboard/words'

/** A change at its newest notice, with every notice that was sent of it. */
export type ChangeEntry = { change: ScheduledChange; notices: ScheduledChangeNotice[]; latest: ScheduledChangeNotice }

const COMING: ScheduledChangeState[] = ['scheduled', 'pausing', 'running']
const DONE_DAYS = 30

export function collectChanges(hosts: FleetHost[]): ChangeEntry[] {
  const byId = new Map<string, ScheduledChangeNotice[]>()
  for (const h of hosts) {
    // A change's id counts up per machine, so the same id on two machines is two changes.
    for (const n of h.scheduled) {
      const key = `${h.fingerprint}:${n.change.id}`
      byId.set(key, [...(byId.get(key) ?? []), n])
    }
  }
  return [...byId.values()].map(all => {
    const notices = [...all].sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    const latest = notices[notices.length - 1]
    return { change: latest.change, notices, latest }
  })
}

/** What is planned or under way, by its time; and what ended in the last 30 days, newest first. */
export function changeLists(hosts: FleetHost[], now: Date): { planned: ChangeEntry[]; done: ChangeEntry[] } {
  const since = new Date(now.getTime() - DONE_DAYS * 86400_000).toISOString()
  const all = collectChanges(hosts)
  return {
    planned: all.filter(e => COMING.includes(e.change.state)).sort((a, b) => a.change.at.localeCompare(b.change.at)),
    done: all.filter(e => !COMING.includes(e.change.state) && e.change.at >= since).sort((a, b) => b.change.at.localeCompare(a.change.at)),
  }
}

const version = (detail: string | null) => (detail ? detail.replace(/^to\s+/i, '') : null)

/** What the change does, in a sentence a person reads: "Upgrade HQ to 0.3.0". A site goes by its machine's name. */
export function changeTitle(c: ScheduledChange): string {
  const what = c.target === 'hq' ? 'HQ' : c.machine.name
  switch (c.kind) {
    case 'upgrade': return `Upgrade ${what}${version(c.detail) ? ` to ${version(c.detail)}` : ''}`
    case 'resize': return `Change ${possessive(what)} capacity${c.detail ? `: ${c.detail}` : ''}`
    case 'restore': return `Restore ${what} from a backup${c.detail ? ` (${c.detail})` : ''}`
    case 'move': return `Move ${what}${c.detail ? ` ${c.detail}` : ''}`
    case 'erase': return `Erase ${what}`
    case 'suspend': return `Suspend ${what}`
    case 'resume': return `Resume ${what}`
  }
}

export function scheduledBy(by: ScheduledBy): string {
  switch (by.kind) {
    case 'fleetAdmin': return by.name
    case 'machineAdmin': return 'its machine admin, on the machine'
    case 'cloud': return 'Cloud'
    case 'maintenanceWindow': return 'the maintenance window'
  }
}

/** Cloud's changes are shown here and changed only in Cloud (board *Scheduled*). */
export const changeableHere = (c: ScheduledChange): boolean => c.scheduledBy.kind !== 'cloud' && COMING.includes(c.state)

export function stateOf(e: ChangeEntry): { label: string; tone: PillTone; detail: string | null } {
  const reason = e.latest.reason
  switch (e.change.state) {
    case 'scheduled': return { label: 'Scheduled', tone: 'neutral', detail: null }
    case 'pausing': return { label: 'Pausing runs', tone: 'warning', detail: null }
    // Set while it waits for a backup that holds the machine, such as the nightly one.
    case 'running': return { label: 'Under way', tone: 'warning', detail: reason }
    case 'done': return { label: 'Done', tone: 'healthy', detail: null }
    case 'rolledBack': return { label: 'Failed — rolled back', tone: 'danger', detail: reason }
    case 'missed': return { label: 'Not run', tone: 'warning', detail: reason ?? 'Its time passed while the machine was not running.' }
    case 'cancelled': return { label: 'Cancelled', tone: 'neutral', detail: null }
  }
}

export type UpgradeStep = { label: string; mark: 'done' | 'now' | 'waiting' | 'failed'; detail: string | null; at: string | null }

/** An upgrade's steps as far as the notices say; the steps the host service does not report are not drawn. */
export function upgradeSteps(notices: ScheduledChangeNotice[], c: ScheduledChange): UpgradeStep[] {
  const seen = (...updates: ScheduledChangeNotice['update'][]) => notices.find(n => updates.includes(n.update))
  const steps: UpgradeStep[] = []
  const told = seen('scheduled', 'changed')
  steps.push({ label: 'Notice shown to members', mark: told ? 'done' : 'waiting', detail: null, at: told?.sentAt ?? null })
  const paused = seen('pausing')
  if (paused) steps.push({ label: 'Runs paused', mark: 'done', detail: null, at: paused.sentAt })
  const started = seen('started')
  const completed = seen('completed')
  const failed = seen('failed')
  if (!started && !completed && !failed) return steps
  const over = Boolean(completed || failed)
  const to = version(c.detail)
  steps.push({ label: to ? `Starting ${to}` : 'Starting', mark: over ? 'done' : 'now', detail: null, at: started?.sentAt ?? null })
  if (completed) steps.push({ label: 'Health check', mark: 'done', detail: null, at: completed.sentAt })
  else if (failed) {
    steps.push({ label: 'Health check', mark: 'failed', detail: failed.reason, at: failed.sentAt })
    steps.push({ label: 'Rolled back', mark: 'done', detail: null, at: failed.sentAt })
  } else steps.push({ label: 'Health check', mark: 'waiting', detail: null, at: null })
  return steps
}
