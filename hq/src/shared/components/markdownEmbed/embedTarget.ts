/**
 * Where a Markdown image or link points, read against the place the text belongs to (spec part 2, *Embedded files*):
 * a file in that place, a path that leaves it, another website, or nothing a file can be. A relative path resolves
 * against the page's folder; a path starting with `/` against the place's top. Nothing here can name a file outside
 * the place: `..` past the top is "outside", and the ref is checked by core's `readFileRef` as every other file name is.
 * The site still confines the real path.
 *
 * A place's folders are siblings: in a knowledge page or a task's text, a relative path whose first part is `files`,
 * `artefacts` or `workspaces/<id>` names that file of the owner's storage, and in a task's text
 * `attachments/<task key>/<file>` names that task's own attachment. `..` is applied inside that root only: it never
 * steps from one root (or one workspace) into another.
 */
import {
  MAX_FILE_PATH_LENGTH, readFileRef,
  type KnowledgeOwnerRef, type LocationRef, type SiteFileRef, type StorageOwnerRef,
} from '@agenthix/core'
import { refOfReference } from '../../../storage/pages/fileReferences'
import { taskReferenceOf, writeTaskReference, type TaskReference } from '../../taskReferences'
import type { OpenedTaskFile } from './taskChipTypes'

/** The task whose text this is: `attachments/<key>/<file>` names one of its attachments. */
export type EmbedTask = { id: string; key: string }

/**
 * The place relative paths resolve in. `siblings` is the storage of the owner a knowledge page or a task belongs to,
 * whose `files/…`, `artefacts/…` and `workspaces/<id>/…` the text reaches; the organisation's knowledge has none.
 */
export type EmbedPlace =
  | { space: 'place'; loc: LocationRef; siblings?: StorageOwnerRef; task?: EmbedTask }
  | { space: 'knowledge'; owner: KnowledgeOwnerRef; siblings?: StorageOwnerRef }
  | { space: 'artefact'; owner: StorageOwnerRef }
  /** An owner's whole folder, as a conversation's agent sees it: `files/…`, `workspaces/<id>/…`, `artefacts/<name>`. */
  | { space: 'owner'; owner: StorageOwnerRef }

export interface MarkdownEmbedContext {
  place: EmbedPlace
  /** The page's folder inside the place: '' at its top. */
  folder: string
  /** Opens a file of the place on its own. Without it an embed is shown but a click opens nothing. */
  onOpen?: (ref: SiteFileRef) => void
  /** The place's address (`/projects/AGX`), so a stable link pasted into the text and naming it opens in place. */
  placePath?: string
  /** When the text was written (a message's time), so a file changed since says so. */
  writtenAt?: string
  /** Opens a task's working file or attachment beside the text (a conversation's chips). */
  onOpenTaskFile?: (file: OpenedTaskFile) => void
}

export type EmbedTarget =
  | { kind: 'file'; ref: SiteFileRef; name: string }
  /** A folder of the place, written with a trailing slash (`files/reports/`). */
  | { kind: 'folder'; ref: SiteFileRef; name: string }
  /** A task or one of its files (`tasks/MOP-1`, `attachments/MOP-1/a.png`), in a conversation: found across the organisation. */
  | { kind: 'task'; ref: TaskReference; reference: string }
  /** An attachment of the task the text belongs to, named by its file name; hq finds and checks it when opened. */
  | { kind: 'attachment'; taskId: string; taskKey: string; ref: Extract<TaskReference, { kind: 'attachment' }>; reference: string; name: string }
  | { kind: 'outside'; name: string }
  | { kind: 'web'; url: string; host: string }
  | { kind: 'none' }

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

function lastPart(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function webTarget(address: string): EmbedTarget {
  try {
    const url = new URL(address)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'none' }
    return { kind: 'web', url: url.href, host: url.hostname }
  } catch {
    return { kind: 'none' }
  }
}

/** The path's parts after `.` and `..` are applied, or null when it steps above the top. */
function settle(parts: string[]): string[] | null {
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(part)
  }
  return out
}

function refIn(place: EmbedPlace, parts: string[]): SiteFileRef | null {
  if (place.space === 'owner') return refOfReference(place.owner, parts)
  const path = parts.join('/')
  const candidate = place.space === 'place' ? { space: 'place', loc: place.loc, path }
    : place.space === 'knowledge' ? { space: 'knowledge', owner: place.owner, path }
      : parts.length === 1 ? { space: 'artefact', owner: place.owner, name: path } : null
  const ref = candidate && readFileRef(candidate)
  return ref && ref.space !== 'upload' ? ref : null
}

/** How many leading parts make each sibling root: `files`, `artefacts`, `workspaces/<id>`, `attachments/<task key>`. */
const SIBLING_ROOTS: Record<string, number> = { files: 1, artefacts: 1, workspaces: 2, attachments: 2 }

/** The sibling a written path names, `outside` for one that leaves its root, or null when it names none. */
function siblingTarget(place: EmbedPlace, written: string[], name: string): EmbedTarget | null {
  if (place.space !== 'place' && place.space !== 'knowledge') return null
  let start = 0
  while (written[start] === '.') start++
  const words = written.slice(start)
  const size = SIBLING_ROOTS[words[0]]
  if (!size) return null
  const task = place.space === 'place' ? place.task : undefined
  if (words[0] === 'attachments' ? !task : !place.siblings) return null
  const outside: EmbedTarget = { kind: 'outside', name }
  const root = words.slice(0, size)
  if (root.length < size || root.some(p => p === '' || p === '.' || p === '..')) return outside
  const rest = settle(words.slice(size))
  if (!rest || rest.length === 0) return outside
  if (task && words[0] === 'attachments') {
    // Only the text's own task: another task's attachment is a chip in a conversation, never reached from here.
    const named = taskReferenceOf([...root, ...rest])
    if (named?.kind !== 'attachment' || (named.task !== task.key && named.task !== task.id)) return outside
    return { kind: 'attachment', taskId: task.id, taskKey: task.key, ref: named, reference: writeTaskReference(named), name: named.name }
  }
  const ref = place.siblings ? refOfReference(place.siblings, [...root, ...rest]) : null
  return ref ? { kind: 'file', ref, name: rest[rest.length - 1] } : outside
}

export function resolveEmbedTarget(address: string | undefined | null, context: MarkdownEmbedContext): EmbedTarget {
  const raw = (address ?? '').trim()
  if (raw === '' || raw.startsWith('#')) return { kind: 'none' }
  if (raw.startsWith('//')) return webTarget(`https:${raw}`)
  if (SCHEME.test(raw)) return /^https?:/i.test(raw) ? webTarget(raw) : { kind: 'none' }

  const written = raw.replace(/[?#].*$/, '')
  let path: string
  try {
    path = decodeURIComponent(written)
  } catch {
    return { kind: 'outside', name: lastPart(written) }
  }
  const name = lastPart(path)
  if (path.includes('\0') || path.length > MAX_FILE_PATH_LENGTH) return { kind: 'outside', name }
  const fromTop = /^[\\/]/.test(path)
  const sibling = fromTop ? null : siblingTarget(context.place, path.split(/[\\/]/), name)
  if (sibling) return sibling
  const base = fromTop ? [] : context.folder.split(/[\\/]/)
  const parts = settle([...base, ...path.split(/[\\/]/)])
  if (!parts) return { kind: 'outside', name }
  if (parts.length === 0) return { kind: 'none' }
  if (context.place.space === 'owner') {
    const task = taskReferenceOf(parts)
    if (task) return { kind: 'task', ref: task, reference: parts.join('/') }
  }
  const ref = refIn(context.place, parts)
  if (!ref) return { kind: 'outside', name }
  const folder = context.place.space === 'owner' && ref.space === 'place' && /[\\/]$/.test(path)
  return { kind: folder ? 'folder' : 'file', ref, name: parts[parts.length - 1] }
}

/** One key per file, so the same file embedded twice is asked for once. */
export function embedKey(ref: SiteFileRef): string {
  switch (ref.space) {
    case 'place': {
      const { ownerType, ownerId, workspaceId, taskId } = ref.loc
      return JSON.stringify(['place', ownerType, ownerId, workspaceId ?? null, taskId ?? null, ref.path])
    }
    case 'artefact':
      return JSON.stringify(['artefact', ref.owner.ownerType, ref.owner.ownerId, ref.name])
    case 'knowledge':
      return JSON.stringify(['knowledge', ref.owner.ownerType, ref.owner.ownerId, ref.path, ref.versionId ?? null])
  }
}
