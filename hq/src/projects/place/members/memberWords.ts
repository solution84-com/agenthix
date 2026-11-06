/**
 * The words of a project's one member list: where a role comes from (in their own right, through a team, or both;
 * adr-0103), what each role allows, what a team's people will have when it joins, and why a change made by a team is
 * greyed on its people. Pure, so the wording is tested on its own.
 */
import type { AgentMember, PersonMember, ProjectRole, TeamRef } from '../../memberList'

const RANK: Record<ProjectRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2 }
export const ROLE_WORD: Record<ProjectRole, string> = { ADMIN: 'Admin', MEMBER: 'Member', VIEWER: 'Viewer' }

/** Offered in this order wherever a role is chosen. */
export const ROLE_ORDER: readonly ProjectRole[] = ['MEMBER', 'VIEWER', 'ADMIN']

export const ROLE_ALLOWS: Record<ProjectRole, string> = {
  MEMBER: 'Talk to its agents, start and change work, answer approvals',
  VIEWER: 'See everything, change nothing',
  ADMIN: "Also change the project's settings and who is in it",
}

const names = (teams: TeamRef[]) => teams.map(t => t.name).join(', ')
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

/** The highest role any of their teams gives them here; null when no team brings them. */
export function teamRoleOf(teams: TeamRef[]): ProjectRole | null {
  return teams.reduce<ProjectRole | null>((best, t) => (best === null || RANK[t.role] > RANK[best] ? t.role : best), null)
}

/** "direct member", "through Studio", or "direct member · also Member through Studio". */
export function personSource(row: Pick<PersonMember, 'ownRole' | 'teams'>): string {
  if (row.teams.length === 0) return 'direct member'
  if (row.ownRole === null) return `through ${names(row.teams)}`
  return `direct member · also ${row.teams.map(t => `${ROLE_WORD[t.role]} through ${t.name}`).join(', ')}`
}

/** An agent has no role: "directly", "through Studio", or "directly · also through Studio". */
export function agentSource(row: Pick<AgentMember, 'direct' | 'teams'>): string {
  if (row.teams.length === 0) return 'directly'
  return row.direct ? `directly · also through ${names(row.teams)}` : `through ${names(row.teams)}`
}

/** The roles a person here only through teams may be given in their own right: only higher ones change anything. */
export function higherRoles(teams: TeamRef[]): ProjectRole[] {
  const floor = teamRoleOf(teams)
  return ROLE_ORDER.filter(r => floor === null || RANK[r] > RANK[floor])
}

/** Why a choice of their own role is offered, the same as, or lower than what their teams give. */
export function ownRoleNote(role: ProjectRole, teams: TeamRef[]): string {
  const floor = teamRoleOf(teams)
  const by = names(teams)
  if (floor === null || RANK[role] > RANK[floor]) return ROLE_ALLOWS[role]
  if (role === floor) return `The same as ${by} gives`
  return `Lower than ${by} gives: it would change nothing`
}

/** The greyed actions on someone here only through a team, each saying what to do instead. */
export function throughTeamHints(name: string, teams: TeamRef[]) {
  const by = names(teams)
  const role = teamRoleOf(teams)
  const who = firstName(name)
  return {
    changeRole: `${who} is here through ${by} as ${role ? ROLE_WORD[role] : 'a member'}. Change the team's role, or take them out of the team.`,
    remove: `${who} is here through ${by}. Remove ${teams.length === 1 ? 'the team' : 'the teams'} from this project, or take them out of the team.`,
  }
}

export function agentThroughTeamHint(name: string, teams: TeamRef[]): string {
  return `${name} is here through ${names(teams)}. Remove the team from this project, or take ${name} out of the team.`
}

/** What one of a team's people will have here once it joins: the higher of their role now and the team's. */
export function joinsAs(now: ProjectRole | null, teamRole: ProjectRole): { role: ProjectRole; note: string | null } {
  if (now === null) return { role: teamRole, note: null }
  if (RANK[now] > RANK[teamRole]) return { role: now, note: `Already ${now === 'ADMIN' ? 'an' : 'a'} ${ROLE_WORD[now]} here; keeps it, the higher role wins` }
  if (now === teamRole) return { role: teamRole, note: `Already here as ${ROLE_WORD[now]}` }
  return { role: teamRole, note: `Here as ${ROLE_WORD[now]} now; the higher role wins` }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The header: "6 people · 2 agents · 1 team"; "1 person · no agents" before any agent or team. */
export function membersLine(t: { people: number; agents: number; teams: number }): string {
  const parts = [plural(t.people, 'person', 'people'), t.agents === 0 ? 'no agents' : plural(t.agents, 'agent', 'agents')]
  if (t.teams > 0) parts.push(plural(t.teams, 'team', 'teams'))
  return parts.join(' · ')
}
