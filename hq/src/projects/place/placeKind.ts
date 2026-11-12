/**
 * Which of the three project places a project is drawn as: a shared project; a personal project, only its person's;
 * or Your space, the personal project behind Chat, which works in the person's own storage (`placeStorageOf`).
 */
export type ProjectPlaceKind = 'shared' | 'personal' | 'space'

export function projectPlaceKind(project: { personalOwnerId: string | null; personalSpace?: boolean }): ProjectPlaceKind {
  if (!project.personalOwnerId) return 'shared'
  return project.personalSpace ? 'space' : 'personal'
}

/**
 * Your space's and a personal project's sections after Overview and Conversations: a shared project's, in the same
 * order, less those that concern a team or other people (Sprints, Timeline, Workroom, Members, GitHub), with the
 * Agents roster where a shared project has Members.
 */
export const PERSONAL_SECTION_ORDER = [
  'tasks', 'boards', 'runs', 'routines', 'automation', 'workflows', 'skills', 'files', 'artefacts', 'knowledge', 'workspaces', 'agents', 'secrets', 'settings',
]
