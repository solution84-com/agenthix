/** A scheduled change in words (the CLI board's *agenthix scheduled*): `Upgrade HQ to 0.2.1`, `Resize the site to 6 GB`. */
import type { ScheduledChange, ScheduledChangeKind } from '@agenthix/core'

const VERB: Record<ScheduledChangeKind, string> = {
  upgrade: 'Upgrade', resize: 'Resize', restore: 'Restore', move: 'Move', erase: 'Erase', suspend: 'Suspend', resume: 'Resume',
}

const NOUN: Record<ScheduledChangeKind, string> = {
  upgrade: 'upgrade', resize: 'resize', restore: 'restore', move: 'move', erase: 'erase', suspend: 'suspension', resume: 'resumption',
}

const TO: Partial<Record<ScheduledChangeKind, string>> = { upgrade: 'to', resize: 'to', move: 'to' }

const subject = (c: Pick<ScheduledChange, 'target' | 'siteName'>) => (c.target === 'hq' ? 'HQ' : `the site ${c.siteName}`)

/**
 * `Resize the site to 6 GB`, for the list, where the machine has one site; with `inSentence`, `the resize of the
 * site hq-box`.
 */
export function changeName(c: Pick<ScheduledChange, 'kind' | 'target' | 'siteName' | 'detail'>, inSentence = false): string {
  if (inSentence) return `the ${NOUN[c.kind]} of ${subject(c)}`
  const detail = c.detail ? ` ${TO[c.kind] ?? '—'} ${c.detail}` : ''
  return `${VERB[c.kind]} ${c.target === 'hq' ? 'HQ' : 'the site'}${detail}`
}

/** Who scheduled it, for the list: a fleet admin by name, never a machine admin's account (there is none). */
export function scheduledByText(c: Pick<ScheduledChange, 'scheduledBy'>): string {
  switch (c.scheduledBy.kind) {
    case 'fleetAdmin': return `scheduled by ${c.scheduledBy.name}`
    case 'cloud': return 'scheduled by Cloud'
    case 'machineAdmin': return 'scheduled here'
    case 'maintenanceWindow': return 'maintenance window'
  }
}

const DONE: Record<ScheduledChangeKind, string> = {
  upgrade: 'upgraded', resize: 'resized', restore: 'restored', move: 'moved', erase: 'erased', suspend: 'suspended', resume: 'started again',
}

/** `The site hq-box will be resized to 6 GB`. */
export function willBe(c: Pick<ScheduledChange, 'kind' | 'target' | 'siteName' | 'detail'>, not = false): string {
  const who = c.target === 'hq' ? 'HQ' : `The site ${c.siteName}`
  const detail = c.detail && TO[c.kind] ? ` ${TO[c.kind]} ${c.detail}` : ''
  return `${who} will ${not ? 'not ' : ''}be ${DONE[c.kind]}${not ? '' : detail}`
}

/** Who hq tells: everyone, for a change to hq; the people whose projects run on the site, for one to a site. */
export const whoIsTold = (c: Pick<ScheduledChange, 'target'>): string =>
  c.target === 'hq' ? 'everyone in HQ' : 'the people whose projects run there'
