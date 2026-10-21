/**
 * How a person's project membership is worked out when teams are among its
 * members (adr-0103). Pure: `writeThrough.ts` reads the rows and writes what
 * this decides.
 *
 * A person is in a project in their own right (with their own role), through
 * one or more of its teams (each with the team's role there), or both. The
 * role that applies is the highest of them; with none, they are not a member.
 */
export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER'

const RANK: Record<ProjectRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2 }

export function higherRole(a: ProjectRole, b: ProjectRole): ProjectRole {
  return RANK[a] >= RANK[b] ? a : b
}

/** The member row a person should have, or null for none. */
export type PersonRow = { role: ProjectRole; direct: boolean; ownRole: ProjectRole | null }

export function personRow(own: ProjectRole | null, teamRoles: readonly ProjectRole[]): PersonRow | null {
  const all = own === null ? [...teamRoles] : [own, ...teamRoles]
  if (all.length === 0) return null
  const role = all.reduce(higherRole)
  // Their own role is kept apart only while a team is also why they are here,
  // so taking the team away gives them back exactly their own.
  return { role, direct: own !== null, ownRole: own !== null && teamRoles.length > 0 ? own : null }
}

/** A person's own role from their current row: none when they are here only through teams. */
export function ownRoleOf(row: { role: ProjectRole; direct: boolean; ownRole: ProjectRole | null } | null): ProjectRole | null {
  if (!row || !row.direct) return null
  return row.ownRole ?? row.role
}
