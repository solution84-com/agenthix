/** What a task's files read (spec part 3, *A task's files*): its own folder on the site, and its attachments opened through hq. */
import { useQuery, listLocationFiles, openTaskAttachment } from 'wasp/client/operations'
import type { FileOpenAnswer, LocationRef } from '@agenthix/core'
import type { ListedEntry } from '@agenthix/ui/projects'

type TaskProject = { id: string; personalSpace?: boolean | null }

/**
 * The task's own folder (`tasks/<task>/`, adr-0039 §10), where its runs work. A task of Your space works in its
 * person's own storage, which the location access rule does not open by task, so it has none to list here.
 */
export function taskLocation(project: TaskProject | null | undefined, taskId: string | undefined): LocationRef | null {
  if (!project || !taskId || project.personalSpace) return null
  return { ownerType: 'project', ownerId: project.id, workspaceId: null, taskId }
}

/** The entries directly under one folder of the task's folder; a folder not made yet lists as empty. */
export function useTaskFolder(loc: LocationRef | null, subPath: string) {
  const { data, isLoading, error } = useQuery(
    listLocationFiles,
    loc ? { target: loc, subPath: subPath || undefined } : undefined,
    { enabled: !!loc },
  )
  return { entries: data?.entries as ListedEntry[] | undefined, isLoading, error: error as Error | null }
}

export const openAttachmentThroughHq = async (attachmentId: string): Promise<FileOpenAnswer> =>
  (await openTaskAttachment({ attachmentId })) as FileOpenAnswer
