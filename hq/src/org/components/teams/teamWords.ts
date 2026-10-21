const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "2 people · 1 agent": a team's mix. */
export function teamMix(people: number, agents: number): string {
  return `${plural(people, 'person', 'people')} · ${plural(agents, 'agent')}`
}

export function worksIn(projects: number): string {
  return projects === 0 ? 'Not in a project yet' : `Works in ${plural(projects, 'project')}`
}

export const ROLE_LABEL = { ADMIN: 'Admin', MEMBER: 'Member', VIEWER: 'Viewer' } as const
export type TeamRole = keyof typeof ROLE_LABEL
