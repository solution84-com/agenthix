/**
 * How a file of a place is named in a message, and read back (spec part 3, *Stable links*, *Chips in conversations*).
 *
 * A conversation's agent sees its place's storage as one folder: `files/…`, `artefacts/<name>`,
 * `workspaces/<id>/…` and `tasks/<id>/…` (the run's mounts). A path written that way — by Mention or by the agent —
 * is a *reference*. A stable link is the place's own address with the tool and the file, never a site, a relay or a
 * ticket.
 */
import { readFileRef, type SiteFileRef, type StorageOwnerRef } from '@agenthix/core'
import { isTaskName } from '../../shared/taskReferences'

export type FilesToolKind = 'files' | 'artefacts' | 'knowledge'

/** What Mention puts into the message box: the file's path in the place, which agents see as its folder. */
export function mentionReference(kind: FilesToolKind, path: string): string {
  return `${kind}/${path}`
}

/** The reference an agent sees for a file, or null for one it has no path to. */
export function referenceOf(ref: SiteFileRef): string | null {
  switch (ref.space) {
    case 'place':
      if (ref.loc.taskId) return `tasks/${ref.loc.taskId}/${ref.path}`
      if (ref.loc.workspaceId) return `workspaces/${ref.loc.workspaceId}/${ref.path}`
      return `files/${ref.path}`
    case 'artefact':
      return `artefacts/${ref.name}`
    case 'knowledge':
      return `knowledge/${ref.path}`
  }
}

/**
 * The file a reference names in an owner's folder, from its parts with `.` and `..` already settled: `files/…`, a
 * workspace's `workspaces/<id>/…` or `artefacts/<name>`. Anything else names no file a person can open from a message.
 */
export function refOfReference(owner: StorageOwnerRef, parts: readonly string[]): SiteFileRef | null {
  const loc = { ownerType: owner.ownerType, ownerId: owner.ownerId, workspaceId: null, taskId: null }
  const [root, ...rest] = parts
  let candidate: unknown = null
  if (root === 'files' && rest.length > 0) candidate = { space: 'place', loc, path: rest.join('/') }
  else if (root === 'workspaces' && rest.length > 1) {
    candidate = { space: 'place', loc: { ...loc, workspaceId: rest[0] }, path: rest.slice(1).join('/') }
  } else if (root === 'artefacts' && rest.length === 1) candidate = { space: 'artefact', owner, name: rest[0] }
  const ref = candidate === null ? null : readFileRef(candidate)
  return ref && ref.space !== 'upload' ? ref : null
}

/** What a chip writes for a reference: its path after the root folder (`reports/q3.pdf`), or an artefact's name. */
export function referenceLabel(reference: string): string {
  const parts = reference.split('/').filter(Boolean)
  if (parts[0] === 'tasks' && parts.length === 2) return parts[1]
  if (parts[0] === 'workspaces' || parts[0] === 'tasks' || parts[0] === 'attachments') return parts.slice(2).join('/') || reference
  return parts.slice(1).join('/') || reference
}

/** A file's stable link's parameters, by where it is; null for one with no tool of its own to open in. */
export function linkParamsOf(ref: SiteFileRef): Record<string, string> | null {
  if (ref.space === 'artefact') return { tool: 'artefacts', artefact: ref.name }
  if (ref.space !== 'place' || ref.loc.taskId) return null
  if (ref.loc.workspaceId) return { tool: 'workspaces', workspace: ref.loc.workspaceId, wfile: ref.path }
  return { tool: 'files', file: ref.path }
}

/** A place's address: the page's path without a conversation (`/projects/AGX/t/<id>` is `/projects/AGX`). */
export function placePathOf(pathname: string): string {
  return pathname.replace(/\/t\/[^/]+\/?$/, '') || '/'
}

/** A stable link: the place's address with only the parameters that name the file. */
export function stableLinkOf(origin: string, placePath: string, names: Record<string, string | null>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(names)) if (value) params.set(key, value)
  return `${origin}${placePath}?${params.toString()}`
}

const PLACE_PATH = /^\/(?:projects\/[^/]+|chat|space)$/

/** A stable link read back: the place's path and the file's reference in it, or null for any other address. */
export function readStableLink(href: string, origin: string): { placePath: string; reference: string } | null {
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (url.origin !== origin || !PLACE_PATH.test(url.pathname)) return null
  const q = url.searchParams
  const tool = q.get('tool')
  let reference: string | null = null
  if (tool === 'files' && q.get('file')) reference = `files/${q.get('file')}`
  else if (tool === 'workspaces' && q.get('workspace') && q.get('wfile')) reference = `workspaces/${q.get('workspace')}/${q.get('wfile')}`
  else if (tool === 'artefacts' && q.get('artefact')) reference = `artefacts/${q.get('artefact')}`
  else if ((!tool || tool === 'tasks') && q.get('task') && isTaskName(q.get('task')!) && !q.get('attachment')) {
    reference = q.get('file') ? `tasks/${q.get('task')}/${q.get('file')}` : `tasks/${q.get('task')}`
  }
  return reference ? { placePath: url.pathname, reference } : null
}

const ARTEFACT_LINK = /^(?:\.\/)?artefacts\/([^/?#]+)$/

/** The file an agent's link `artefacts/<file name>` points at, or null for any other link. */
export function artefactNameFromHref(href: string | null): string | null {
  const match = href ? ARTEFACT_LINK.exec(href) : null
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

const FILE_LINK = /^(?:\.\/)?(files|workspaces)\/([^?#]+)$/

/**
 * The tool parameters an agent's link to a file of its place opens, for a transcript drawn without its place:
 * `artefacts/<name>`, `files/…` or `workspaces/<id>/…`. Null for every other link.
 */
export function toolParamsForHref(href: string | null): Record<string, string> | null {
  const artefact = artefactNameFromHref(href)
  if (artefact) return { tool: 'artefacts', artefact }
  const match = href ? FILE_LINK.exec(href) : null
  if (!match) return null
  let path: string
  try {
    path = decodeURIComponent(match[2])
  } catch {
    return null
  }
  const parts = path.split('/').filter(Boolean)
  if (parts.includes('..') || parts.includes('.')) return null
  if (match[1] === 'files') return parts.length ? { tool: 'files', file: parts.join('/') } : null
  return parts.length > 1 ? { tool: 'workspaces', workspace: parts[0], wfile: parts.slice(1).join('/') } : null
}

/** A reference written in plain text: one of the place's folders, a task or a task's attachments, then a path with no spaces. */
const REFERENCE_IN_TEXT = /(?<![\w/.-])(?:files|artefacts|workspaces|tasks|attachments)\/[^\s<>()[\]{}"'`]+/g
const TRAILING = /[.,;:!?]+$/

export type TextPiece = { kind: 'text'; text: string } | { kind: 'reference'; reference: string } | { kind: 'link'; href: string }

/**
 * Plain text split into its words, the references written in it, and the stable links pasted into it (same origin
 * only), so a person's message shows them as chips. A sentence's last full stop is not part of a path.
 */
export function splitReferences(text: string, origin: string | null): TextPiece[] {
  const found: { at: number; end: number; piece: TextPiece }[] = []
  for (const m of text.matchAll(REFERENCE_IN_TEXT)) {
    const reference = m[0].replace(TRAILING, '')
    if (reference.split('/').filter(Boolean).length > 1) found.push({ at: m.index, end: m.index + reference.length, piece: { kind: 'reference', reference } })
  }
  if (origin) {
    for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const href = m[0].replace(TRAILING, '')
      if (readStableLink(href, origin)) found.push({ at: m.index, end: m.index + href.length, piece: { kind: 'link', href } })
    }
  }
  found.sort((a, b) => a.at - b.at)
  const pieces: TextPiece[] = []
  let from = 0
  for (const f of found) {
    if (f.at < from) continue
    if (f.at > from) pieces.push({ kind: 'text', text: text.slice(from, f.at) })
    pieces.push(f.piece)
    from = f.end
  }
  if (from < text.length) pieces.push({ kind: 'text', text: text.slice(from) })
  return pieces
}
