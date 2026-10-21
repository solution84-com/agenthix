export type OrgRole = 'ADMIN' | 'MEMBER'

/** The organisation's roles (adr-0102). What someone may do in a project is their role there. */
export const ORG_ROLE_CHOICES: { value: OrgRole; label: string; line: string }[] = [
  { value: 'ADMIN', label: 'Admin', line: 'Runs the organisation: its people, agents, projects and settings' },
  { value: 'MEMBER', label: 'Member', line: 'Works in their projects, as their role in each allows' },
]

export function orgRoleLabel(role: OrgRole | null): string {
  return ORG_ROLE_CHOICES.find(c => c.value === role)?.label ?? '—'
}

export type NamedPerson = { name: string; handle: string | null }

export function personMatches(person: NamedPerson, query: string): boolean {
  const q = query.trim().replace(/^@/, '').toLowerCase()
  if (!q) return true
  return person.name.toLowerCase().includes(q) || (person.handle ?? '').toLowerCase().includes(q)
}

/** "Sep 2026": when someone joined, in the People list. */
export function monthYear(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export function projectCountText(count: number): string {
  return `${count} ${count === 1 ? 'project' : 'projects'}`
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function expiryText(expiresAt: Date | string | null, now: Date): string {
  if (!expiresAt) return 'No expiry'
  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000)
  if (days <= 0) return 'Expires today'
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`
}

/** The projects an invitation names, counting those the viewer may not see. */
export function invitedProjectsText(projects: { name: string }[], hiddenProjectCount: number): string | null {
  const parts = projects.map(p => p.name)
  if (hiddenProjectCount > 0) parts.push(`${hiddenProjectCount} private ${hiddenProjectCount === 1 ? 'project' : 'projects'}`)
  return parts.length > 0 ? parts.join(', ') : null
}

export type OpenTasksChoice = { kind: 'person'; userId: string } | { kind: 'wait' }
export type ProjectWithTasks = { id: string; openTaskCount: number }

/** One entry per project where tasks are done on the person's behalf; null until every one has been chosen. */
export function removalDestinations(
  projects: ProjectWithTasks[],
  chosen: Record<string, OpenTasksChoice | undefined>,
): { projectId: string; destination: OpenTasksChoice }[] | null {
  const out: { projectId: string; destination: OpenTasksChoice }[] = []
  for (const p of projects) {
    if (p.openTaskCount === 0) continue
    const destination = chosen[p.id]
    if (!destination) return null
    out.push({ projectId: p.id, destination })
  }
  return out
}

/** Erasing asks for the person's name; their handle, with or without @, is also accepted (as the server does). */
export function eraseConfirmationMatches(person: NamedPerson, typed: string): boolean {
  const t = typed.trim().toLowerCase()
  if (!t) return false
  return t === person.name.toLowerCase() || (!!person.handle && (t === person.handle.toLowerCase() || t === `@${person.handle.toLowerCase()}`))
}

/** Their local time ("3:42 PM"), or null when the zone is unknown or not one the browser knows. */
export function localTimeText(timezone: string | null, now: Date): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(now)
  } catch {
    return null
  }
}

export const FLEET_ADMIN_GIVEN_IN_FLEET_CONSOLE = 'Fleet admin is given in the Fleet Console, not here. A fleet admin looks after the machines and sites; it gives no access to people, projects or work.'

/** The fleet admin role as a person's page shows it: read-only, with where it is given (host-management spec §7). */
export function fleetAdminRole(held: boolean, since: Date | string | null): { state: 'Held' | 'Not held'; note: string } {
  if (!held) return { state: 'Not held', note: 'Given in the Fleet Console. Ask a fleet admin to give it.' }
  const day = since ? new Date(since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null
  return { state: 'Held', note: `Given in the Fleet Console.${day ? ` Held since ${day}.` : ''}` }
}
