/** What the file viewer says of the file it shows, from its target alone: pure, so each place's wording is tested. */
import type { SiteFileRef } from '@agenthix/core'
import { linkParamsOf } from '../fileReferences'
import type { ViewerFrom, ViewerTarget } from './viewerAddress'

type FileTarget = Extract<ViewerTarget, { kind: 'file' }>

/** ‹ back's words: where the person came from, or the page under the viewer by its title. */
export function backLabelOf(from: ViewerFrom, pageTitle: string | null): string {
  if (from.kind === 'conversation') return 'Conversation'
  if (from.kind === 'task') return from.taskKey
  return pageTitle || 'Back'
}

const foldersOf = (path: string) => path.split('/').slice(0, -1).filter(Boolean)

export function pathOf(ref: SiteFileRef): string {
  return ref.space === 'artefact' ? ref.name : ref.path
}

/**
 * The folder line above the name: "Files › reports", "QR-1 › Working files › report", "Artefacts". A file of Your space
 * or of a project, opened over a page that is not that place's own, starts with the place: "Your space › Files › report".
 */
export function breadcrumbOf(
  target: FileTarget, names: { workspace?: string; project?: string; page?: string } = {},
): string[] {
  const { ref } = target
  if (ref.space === 'artefact') return ['Artefacts']
  if (ref.space === 'knowledge') return ['Knowledge', ...foldersOf(ref.path)]
  if (ref.loc.taskId) return [target.taskKey ?? 'Task', 'Working files', ...foldersOf(ref.path)]
  if (ref.loc.workspaceId) return [names.workspace ?? 'Workspace', ...foldersOf(ref.path)]
  const { page } = names
  if (ref.loc.ownerType === 'user') {
    const own = page === '/space' || page === '/chat'
    return [...(own ? [] : ['Your space']), 'Files', ...foldersOf(ref.path)]
  }
  const own = !!page && page.startsWith('/projects/')
  return [...(own || !names.project ? [] : [names.project]), 'Files', ...foldersOf(ref.path)]
}

/**
 * Where a path that names nothing was looked for, as a sentence ends: "QR-1's working files", "Your space",
 * "Q3 review". A place's own files are named by the place, so a conversation in Your space shown beside a project's
 * page never reads as if the project's file were gone.
 */
export function whereOf(target: FileTarget, names: { workspace?: string; project?: string } = {}): string {
  const { ref } = target
  if (ref.space === 'artefact') return 'Artefacts'
  if (ref.space === 'knowledge') return 'Knowledge'
  if (ref.loc.taskId) return `${target.taskKey ?? 'the task'}'s working files`
  if (ref.loc.workspaceId) return names.workspace ?? 'the workspace'
  if (ref.loc.ownerType === 'user') return 'Your space'
  return names.project ? `${names.project}'s files` : 'Files'
}

/** The project a task's key names: `QR-12` is in `/projects/QR`. */
export const projectPathOfTask = (taskKey: string) => `/projects/${encodeURIComponent(taskKey.replace(/-\d+$/, ''))}`

/** Copy link's stable link: the place's address and the parameters naming the file; a task's file on its task. */
export function linkOf(target: ViewerTarget): { names: Record<string, string>; base?: string } | null {
  if (target.kind === 'attachment') {
    return { names: { task: target.taskKey, attachment: target.id }, base: projectPathOfTask(target.taskKey) }
  }
  const { ref } = target
  if (ref.space === 'place' && ref.loc.taskId) {
    return target.taskKey ? { names: { task: target.taskKey, file: ref.path }, base: projectPathOfTask(target.taskKey) } : null
  }
  const names = linkParamsOf(ref)
  return names && target.placePath ? { names, base: target.placePath } : null
}

/** Show in Files: the file in its place's Files tool (or workspace, or Artefacts); null for a task's own file. */
export function filesAddressOf(target: FileTarget): string | null {
  const names = linkParamsOf(target.ref)
  if (!names || !target.placePath) return null
  return `${target.placePath}?${new URLSearchParams(names).toString()}`
}

/** The folder a file was in, in its place's Files tool: where "Open reports" goes. */
export function folderAddressOf(target: FileTarget): string | null {
  const { ref } = target
  if (!target.placePath || ref.space !== 'place' || ref.loc.taskId) return null
  const dir = foldersOf(ref.path).join('/')
  const params = new URLSearchParams(ref.loc.workspaceId ? { tool: 'workspaces', workspace: ref.loc.workspaceId } : { tool: 'files' })
  if (dir && !ref.loc.workspaceId) params.set('dir', dir)
  return `${target.placePath}?${params.toString()}`
}

/** The same path in the place's own Files, for a task's working file that isn't there (S18). */
export function filesTwinOf(target: FileTarget): SiteFileRef | null {
  const { ref } = target
  if (ref.space !== 'place' || !ref.loc.taskId) return null
  return { space: 'place', loc: { ...ref.loc, taskId: null, workspaceId: null }, path: ref.path }
}
