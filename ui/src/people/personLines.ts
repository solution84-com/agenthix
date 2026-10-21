import { sinceText, type NowTone } from '../agents/agentNowLines'
import type { OrgRoleData, ProjectPersonRowData, ProjectRoleData } from './types'

const DAY_MS = 86_400_000

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value))

/** Organisation roles as people read them: Admin · Member; no role is someone erased. */
export function orgRoleLabel(role: OrgRoleData | null): string {
  if (role === 'ADMIN') return 'Admin'
  return role === 'MEMBER' ? 'Member' : 'Former member'
}

/** A project's roles in the order they are offered: Member · Viewer · Admin. */
export const PROJECT_ROLE_CHOICES: readonly ProjectRoleData[] = ['MEMBER', 'VIEWER', 'ADMIN']

export function projectRoleLabel(role: ProjectRoleData): string {
  if (role === 'ADMIN') return 'Admin'
  return role === 'VIEWER' ? 'Viewer' : 'Member'
}

/** A first name for a line that reads "Needs Dana"; the whole name when it has one word. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/** When someone was last here: "today", "yesterday", "Mon", or a date. */
export function lastHereText(value: string | Date, now: Date): string {
  const at = toDate(value)
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: 'short' })
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * The one status line under a person's name in the People tool: what waits on them ("Needs Dana · WEB-27 …",
 * or "Needs you" for the viewer), what they are doing, or when they were last here.
 */
export function personStatusLine(
  row: Pick<ProjectPersonRowData, 'person' | 'now' | 'lastActiveAt'>,
  isMe: boolean,
  at: Date,
): { label: string; tone: NowTone; detail: string } {
  const { now } = row
  const lead = now.lead
  if (now.state === 'needsYou' && lead) {
    return { label: `Needs ${isMe ? 'you' : firstName(row.person.name)}`, tone: 'needs', detail: `${lead.key} ${lead.reason ?? lead.title}` }
  }
  if (now.state === 'running' && lead) {
    return { label: 'Running', tone: 'live', detail: [lead.title, lead.since ? sinceText(lead.since, at) : null].filter(Boolean).join(' · ') }
  }
  return {
    label: row.lastActiveAt ? `Last here ${lastHereText(row.lastActiveAt, at)}` : 'Not active here yet',
    tone: 'muted',
    detail: '',
  }
}

function validZone(timezone: string | null): string | undefined {
  if (!timezone) return undefined
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone })
    return timezone
  } catch {
    return undefined
  }
}

/** "16:42" in their zone; null when they never set one. */
export function localTime(timezone: string | null, at: Date): string | null {
  const zone = validZone(timezone)
  if (!zone) return null
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(at)
}

function offsetMinutes(zone: string | undefined, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - at.getTime()) / 60_000
}

/** Their local time beside the viewer's: "16:42 · 6 h ahead of you", "… · same time as you". */
export function localTimeBeside(timezone: string | null, viewerTimezone: string | null, at: Date): string | null {
  const time = localTime(timezone, at)
  if (!time) return null
  const theirs = validZone(timezone)
  const mine = validZone(viewerTimezone)
  if (!mine) return time
  const hours = Math.round(((offsetMinutes(theirs, at) - offsetMinutes(mine, at)) / 60) * 10) / 10
  if (hours === 0) return `${time} · same time as you`
  const size = Math.abs(hours)
  return `${time} · ${size} h ${hours > 0 ? 'ahead of' : 'behind'} you`
}

/** "since Sep 2026". */
export function sinceMonth(value: string | Date): string {
  return `since ${toDate(value).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
}

/** "2 Sep 2026". */
export function dayText(value: string | Date): string {
  return toDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "@handle · Admin · you", "@handle · Member · in 2 projects": the pick list's second line. */
export function pickerSubline(p: { handle: string | null; roleLabel: string; projectCount: number; isMe: boolean }): string {
  const parts = [p.handle ? `@${p.handle}` : null, p.roleLabel]
  if (p.isMe) parts.push('you')
  else if (p.projectCount > 0) parts.push(`in ${p.projectCount} ${p.projectCount === 1 ? 'project' : 'projects'}`)
  return parts.filter(Boolean).join(' · ')
}
