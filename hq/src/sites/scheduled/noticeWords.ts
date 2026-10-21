/**
 * What members read of a scheduled change (host-management spec §14; the HQ board's *Scheduled changes, as members
 * see them*), which people read as maintenance, never a change: the site by its name (never the machine), the time in the reader's own zone, how long, what happens
 * to runs, and that nothing is asked of them. Never who scheduled it. Pure, so each wording is tested on its own.
 */
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS, type ScheduledChangeKind, type ScheduledChangeUpdate } from '@agenthix/core'

export type ChangeFacts = {
  kind: ScheduledChangeKind
  /** The site's name; null for a change to hq itself. */
  siteName: string | null
  at: Date
  expectedMinutes: number | null
  detail: string | null
}

const DONE: Record<ScheduledChangeKind, string> = {
  upgrade: 'upgraded', resize: 'resized', restore: 'restored', move: 'moved', erase: 'erased', suspend: 'suspended', resume: 'started again',
}

const NOUN: Record<ScheduledChangeKind, string> = {
  upgrade: 'upgrade', resize: 'resize', restore: 'restore', move: 'move', erase: 'erase', suspend: 'suspension', resume: 'restart',
}

function parts(at: Date, zone: string): Record<string, string> {
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  } catch {
    format = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  }
  return Object.fromEntries(format.formatToParts(at).map(p => [p.type, p.value]))
}

/** `Sat 18 Oct`, in the reader's zone. */
export function dayIn(at: Date, zone: string): string {
  const p = parts(at, zone)
  return `${p.weekday} ${p.day} ${p.month}`
}

/** `02:00`, in the reader's zone. */
export function clockIn(at: Date, zone: string): string {
  const p = parts(at, zone)
  return `${p.hour}:${p.minute}`
}

export const whenIn = (at: Date, zone: string) => `${dayIn(at, zone)} at ${clockIn(at, zone)}`

const pauseFrom = (f: ChangeFacts, zone: string) => clockIn(new Date(f.at.getTime() - SCHEDULED_CHANGE_PAUSE_LEAD_MS), zone)

function lasting(f: ChangeFacts): string {
  if (!f.expectedMinutes) return ''
  return f.expectedMinutes === 1 ? ', for about a minute' : `, for about ${f.expectedMinutes} minutes`
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const whose = (f: Pick<ChangeFacts, 'siteName'>) => (f.siteName ? `${f.siteName}'s` : "HQ's")
const subject = (f: Pick<ChangeFacts, 'siteName'>) => f.siteName ?? 'HQ'
const detail = (f: ChangeFacts) => (f.detail && (f.kind === 'upgrade' || f.kind === 'resize' || f.kind === 'move') ? ` to ${f.detail}` : '')

export type NoticeText = { title: string; body: string }

/**
 * The notification for this update, for one reader: `projects` are theirs that run where the change is (empty for
 * a change to hq itself, which pauses everyone's). Null when the update clears the notice (it is done) or changes
 * nothing a person reads (it is pausing or running, as they were told it would).
 */
export function noticeText(update: ScheduledChangeUpdate, f: ChangeFacts, projects: string[], zone: string): NoticeText | null {
  const one = projects.length === 1
  const pauses = f.siteName
    ? `${projects.length ? list(projects) : 'Runs there'} ${one ? 'pauses' : 'pause'} from ${pauseFrom(f, zone)} and ${one ? 'carries' : 'carry'} on afterwards.`
    : `From ${pauseFrom(f, zone)} no new runs start, and agents already working pause and carry on afterwards.`
  const after = 'You don’t need to do anything.'
  switch (update) {
    case 'scheduled':
      return f.siteName
        ? { title: 'Scheduled maintenance', body: `${subject(f)}, where your work runs, is ${DONE[f.kind]}${detail(f)} on ${whenIn(f.at, zone)}${lasting(f)}. ${pauses} ${after}` }
        : { title: 'Scheduled maintenance: HQ will be unavailable', body: `HQ is ${DONE[f.kind]}${detail(f)} on ${whenIn(f.at, zone)}${lasting(f)}, so everyone is told. ${pauses} ${after}` }
    case 'changed':
      return { title: 'Scheduled maintenance moved', body: `${whose(f)} ${NOUN[f.kind]} is now ${whenIn(f.at, zone)}${lasting(f)}. ${pauses} ${after}` }
    case 'cancelled':
      return { title: 'Scheduled maintenance cancelled', body: `${whose(f)} ${NOUN[f.kind]} on ${dayIn(f.at, zone)} is off. Nothing pauses.` }
    case 'failed':
      return { title: 'Scheduled maintenance did not complete', body: `${whose(f)} ${NOUN[f.kind]} did not complete, and it was put back as it was. Runs carry on.` }
    case 'missed':
      return { title: 'Scheduled maintenance did not happen', body: `${whose(f)} ${NOUN[f.kind]} on ${dayIn(f.at, zone)} did not happen. Nothing changed, and runs carry on.` }
    case 'pausing':
    case 'started':
    case 'completed':
      return null
  }
}

/** Why a task waits, on its row: `Paused for scheduled maintenance: the upgrade of office-server. …`. */
export const SCHEDULED_CHANGE_REASON_PREFIX = 'Paused for scheduled maintenance'

export function pausedReason(f: Pick<ChangeFacts, 'kind' | 'siteName'>): string {
  return `${SCHEDULED_CHANGE_REASON_PREFIX}: the ${NOUN[f.kind]} of ${subject(f)}. It carries on by itself when that is done.`
}

/** What a person reads when a message cannot start a run now. */
export function heldMessage(f: Pick<ChangeFacts, 'kind' | 'siteName'>): string {
  return `Not sent: ${subject(f)} is being ${DONE[f.kind]} in scheduled maintenance, so no new runs start there until it is done. Try again in a few minutes.`
}

/** Who stopped a run that was going, as the run's history names it. */
export const stoppedBy = (f: Pick<ChangeFacts, 'kind' | 'siteName'>) => `the scheduled ${NOUN[f.kind]} of ${subject(f)}`

/** A notice on a project's page, or on Home when the change is to hq itself (the HQ board's *Scheduled changes, as members see them*). */
export type BannerFacts = ChangeFacts & { told: Date; moved: Date | null }

const monthDay = (at: Date, zone: string) => { const p = parts(at, zone); return `${p.day} ${p.month}` }

/** "Told on 13 Oct" and, when the time changed since, ", moved today at 15:10". */
export function toldLine(told: Date, moved: Date | null, now: Date, zone: string): string {
  const base = `Told on ${monthDay(told, zone)}`
  if (!moved) return base
  const today = monthDay(moved, zone) === monthDay(now, zone)
  return `${base}, moved ${today ? 'today' : `on ${monthDay(moved, zone)}`} at ${clockIn(moved, zone)}`
}

/** The banner a member reads: what will happen to runs and that nothing is asked of them. `moved` leads the title with that. */
export function bannerText(f: BannerFacts, zone: string): NoticeText {
  const when = `${whenIn(f.at, zone)}${lasting(f)}`
  const pause = pauseFrom(f, zone)
  const carryOn = 'agents already working finish their current step, pause, and carry on afterwards. You don’t need to do anything.'
  if (!f.siteName) {
    return {
      title: `Scheduled maintenance: HQ will be unavailable on ${when}`,
      body: `HQ’s machine is being ${DONE[f.kind]}${detail(f)}, so everyone is told. From ${pause} no new runs start; ${carryOn}`,
    }
  }
  const body = `${f.siteName}, where this project runs, is being ${DONE[f.kind]}${detail(f)}. From ${pause} no new runs start here; ${carryOn}`
  return f.moved
    ? { title: `Moved: maintenance is now ${when}`, body }
    : { title: `Scheduled maintenance will pause runs on ${when}`, body }
}
