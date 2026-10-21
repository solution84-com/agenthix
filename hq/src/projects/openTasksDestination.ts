/**
 * Where a departing person's open tasks go (every screen reviewed spec §3,
 * People): to another person in the project, or left waiting — blocked until
 * someone takes them on. A required choice with no default, for removal from a
 * project and from the organisation alike. Pure: `openTaskHandover.ts` applies it.
 */
export type OpenTasksDestination = { kind: 'person'; userId: string } | { kind: 'wait' }

export type ProjectDestination = { projectId: string; destination: OpenTasksDestination }

export function parseOpenTasksDestination(input: unknown): OpenTasksDestination {
  if (input === undefined || input === null) {
    throw new Error('Choose where their open tasks go: another person here, or leave them waiting')
  }
  const value = input as { kind?: unknown; userId?: unknown }
  if (value.kind === 'wait') return { kind: 'wait' }
  if (value.kind === 'person' && typeof value.userId === 'string' && value.userId !== '') {
    return { kind: 'person', userId: value.userId }
  }
  throw new Error('Their open tasks go to another person here, or wait')
}

export function parseDestinationsByProject(input: readonly ProjectDestination[] | undefined): Map<string, OpenTasksDestination> {
  const byProject = new Map<string, OpenTasksDestination>()
  for (const entry of input ?? []) {
    if (byProject.has(entry.projectId)) throw new Error('A project is named more than once')
    byProject.set(entry.projectId, parseOpenTasksDestination(entry.destination))
  }
  return byProject
}
