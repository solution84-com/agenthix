import type { MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'

/** What a task's text needs of its task beyond its ids: its key, and whether its project is its person's Your space. */
export interface TaskEmbedFacts {
  key?: string
  personalSpace?: boolean | null
  personalOwnerId?: string | null
  /** What a click on an embedded file does; without it an embed is shown and a click opens nothing. */
  openers?: Pick<MarkdownEmbedContext, 'onOpen' | 'onOpenTaskFile'>
}

/**
 * A task's text resolves images and file links in the task's own folder of its project; `files/…`, `artefacts/…` and
 * `workspaces/<id>/…` in its project's storage (in its person's own for a task of Your space, which works there), and
 * `attachments/<its key>/<file>` to one of its own attachments.
 */
export function taskEmbed(projectId: string | undefined, taskId: string | undefined, facts: TaskEmbedFacts = {}): MarkdownEmbedContext | undefined {
  if (!projectId || !taskId) return undefined
  const siblings = facts.personalSpace && facts.personalOwnerId
    ? { ownerType: 'user' as const, ownerId: facts.personalOwnerId }
    : { ownerType: 'project' as const, ownerId: projectId }
  return {
    place: {
      space: 'place', loc: { ownerType: 'project', ownerId: projectId, workspaceId: null, taskId }, siblings,
      ...(facts.key ? { task: { id: taskId, key: facts.key } } : {}),
    },
    folder: '',
    ...facts.openers,
  }
}
