/**
 * A project's member list as one list (Members): its people, its agents and its teams, each row saying where it comes
 * from (in its own right, through a team, or both; adr-0103), filtered, searched, sorted and paged. Pure, so the rules
 * are tested on their own; `memberListQuery.ts` reads the rows. Agents are assigned and have no role (adr-0062).
 */
import type { AgentNow } from '../agents/agentNow'
import type { PersonNow } from './personNow'

export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER'
export type MemberFilter = 'everyone' | 'people' | 'agents' | 'teams'
export type MemberSort = 'name' | 'added' | 'active' | 'needs'

export const MEMBER_FILTERS: readonly MemberFilter[] = ['everyone', 'people', 'agents', 'teams']
export const MEMBER_SORTS: readonly MemberSort[] = ['name', 'added', 'active', 'needs']
export const MEMBER_PAGE = 50
export const MEMBER_PAGE_MAX = 200

/** A team that brings someone here, with the role it gives its people. */
export type TeamRef = { id: string; name: string; role: ProjectRole }

type Common = {
  id: string
  name: string
  avatarUrl: string | null
  addedAt: Date
  /** When hq last saw them at work here; null when never. */
  lastActiveAt: Date | null
}

export type PersonMember = Common & {
  kind: 'person'
  handle: string | null
  /** The role that applies: the higher of their own and every team's. */
  role: ProjectRole
  /** Their role in their own right; null when they are here only through teams. */
  ownRole: ProjectRole | null
  teams: TeamRef[]
  isLead: boolean
  isMe: boolean
  now: PersonNow
}

export type AgentMember = Common & {
  kind: 'agent'
  handle: string
  /** What it does, in its own words. */
  description: string | null
  isDefault: boolean
  /** Assigned to the project itself, not only through a team. */
  direct: boolean
  teams: TeamRef[]
  now: AgentNow
}

export type TeamMember = Common & {
  kind: 'team'
  /** The role its people get here. */
  role: ProjectRole
  peopleCount: number
  agentCount: number
  addedBy: string | null
}

export type MemberRow = PersonMember | AgentMember | TeamMember

export type MemberCounts = { everyone: number; people: number; agents: number; teams: number }

export type MemberListArgs = {
  filter?: MemberFilter
  search?: string
  sort?: MemberSort
  /** Narrows the list to one team: its row first, then its people and agents. */
  teamId?: string
  offset?: number
  limit?: number
}

export type MemberListPage = {
  /** How many of each match the search (and the team, when narrowed), whatever the filter. */
  counts: MemberCounts
  /** Rows matching filter, search and team, before paging. */
  total: number
  rows: MemberRow[]
}

const KIND_OF_FILTER: Record<Exclude<MemberFilter, 'everyone'>, MemberRow['kind']> = { people: 'person', agents: 'agent', teams: 'team' }

/** Refuses what a caller could send that the list does not know, so a bad value is an error and not a silent default. */
export function readMemberListArgs(args: Record<string, unknown>): Required<Omit<MemberListArgs, 'teamId'>> & { teamId: string | null } {
  const filter = args.filter ?? 'everyone'
  const sort = args.sort ?? 'name'
  if (typeof filter !== 'string' || !MEMBER_FILTERS.includes(filter as MemberFilter)) throw new Error('A filter is everyone, people, agents or teams')
  if (typeof sort !== 'string' || !MEMBER_SORTS.includes(sort as MemberSort)) throw new Error('A sort is name, added, active or needs')
  const search = args.search ?? ''
  if (typeof search !== 'string') throw new Error('A search is text')
  const teamId = args.teamId ?? null
  if (teamId !== null && typeof teamId !== 'string') throw new Error('A team is named by its id')
  const whole = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Paging takes whole numbers')
    return Math.min(value, max)
  }
  return {
    filter: filter as MemberFilter, sort: sort as MemberSort, search: search.slice(0, 200), teamId,
    offset: whole(args.offset, 0, Number.MAX_SAFE_INTEGER), limit: Math.max(1, whole(args.limit, MEMBER_PAGE, MEMBER_PAGE_MAX)),
  }
}

function searchText(row: MemberRow): string {
  switch (row.kind) {
    case 'person': return `${row.name} ${row.handle ?? ''}`
    case 'agent': return `${row.name} ${row.handle} ${row.description ?? ''}`
    case 'team': return row.name
  }
}

export function matchesSearch(row: MemberRow, search: string): boolean {
  const q = search.trim().toLowerCase().replace(/^@/, '')
  return q === '' || searchText(row).toLowerCase().includes(q)
}

function inTeam(row: MemberRow, teamId: string): boolean {
  return row.kind === 'team' ? row.id === teamId : row.teams.some(t => t.id === teamId)
}

const byName = (a: MemberRow, b: MemberRow) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)
const time = (d: Date | null) => (d ? new Date(d).getTime() : -Infinity)

/** Something waits on a person: 2; something is running: 1; otherwise 0. A team ranks by nothing of its own. */
function urgency(row: MemberRow): number {
  if (row.kind === 'team') return 0
  if (row.now.needsYouCount > 0) return 2
  return row.now.runningCount > 0 ? 1 : 0
}

const COMPARE: Record<MemberSort, (a: MemberRow, b: MemberRow) => number> = {
  name: byName,
  added: (a, b) => time(b.addedAt) - time(a.addedAt) || byName(a, b),
  active: (a, b) => time(b.lastActiveAt) - time(a.lastActiveAt) || byName(a, b),
  needs: (a, b) => urgency(b) - urgency(a)
    || (b.kind === 'team' ? 0 : b.now.needsYouCount) - (a.kind === 'team' ? 0 : a.now.needsYouCount)
    || byName(a, b),
}

/** One page of the list: search and team first (what the counts count), then the filter, the sort and the page. */
export function memberListPage(all: readonly MemberRow[], args: ReturnType<typeof readMemberListArgs>): MemberListPage {
  const matching = all.filter(r => matchesSearch(r, args.search) && (args.teamId === null || inTeam(r, args.teamId)))
  const counts: MemberCounts = {
    everyone: matching.length,
    people: matching.filter(r => r.kind === 'person').length,
    agents: matching.filter(r => r.kind === 'agent').length,
    teams: matching.filter(r => r.kind === 'team').length,
  }
  const shown = args.filter === 'everyone' ? matching : matching.filter(r => r.kind === KIND_OF_FILTER[args.filter as Exclude<MemberFilter, 'everyone'>])
  const sorted = [...shown].sort(COMPARE[args.sort])
  // A team the list is narrowed to stays on top, with the role every one of its people gets.
  if (args.teamId !== null) {
    const at = sorted.findIndex(r => r.kind === 'team' && r.id === args.teamId)
    if (at > 0) sorted.unshift(...sorted.splice(at, 1))
  }
  return { counts, total: sorted.length, rows: sorted.slice(args.offset, args.offset + args.limit) }
}
