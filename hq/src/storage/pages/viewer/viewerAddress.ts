/**
 * The file viewer's place in the address (the file viewer's rule 6): `?open=<target>` on whatever page is under it, so
 * the browser's Back closes the viewer and the address, copied, opens the same file in the same viewer again.
 *
 * The target is the file and where the person came from, written as base64url JSON. It arrives from the address, so
 * it is read as any outside value is: each field checked, the file's name through core's `readFileRef`, and anything
 * else dropped. hq still checks the person's access when the file is opened.
 */
import { readFileRef, type SiteFileRef } from '@agenthix/core'
import { TASK_KEY } from '../../../shared/taskReferences'

export const VIEWER_PARAM = 'open'

/** Where the person came from, which names ‹ back: a conversation, a task, or the page under the viewer. */
export type ViewerFrom = { kind: 'conversation' } | { kind: 'task'; taskKey: string } | { kind: 'page' }

export type ViewerTarget =
  | {
    kind: 'file'
    ref: SiteFileRef
    /** The place's address (`/projects/QR`, `/chat`), for Copy link and Show in Files; null where none is known. */
    placePath: string | null
    /** The task a working file belongs to, by its key, for the folder line. */
    taskKey?: string
    from: ViewerFrom
  }
  | { kind: 'attachment'; taskId: string; taskKey: string; id: string; from: ViewerFrom }

const PLACE_PATH = /^\/(?:projects\/[A-Za-z0-9_-]{1,64}|chat|space)$/
const ID = /^[A-Za-z0-9_-]{1,100}$/
const MAX_VALUE = 8192

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const taskKeyOf = (v: unknown): string | null => (typeof v === 'string' && TASK_KEY.test(v) ? v : null)

function readFrom(v: unknown): ViewerFrom {
  if (!record(v)) return { kind: 'page' }
  if (v.kind === 'conversation') return { kind: 'conversation' }
  const taskKey = v.kind === 'task' ? taskKeyOf(v.taskKey) : null
  return taskKey ? { kind: 'task', taskKey } : { kind: 'page' }
}

/** A target read from anywhere it may have been changed by hand: the checked target, or null. */
export function readViewerTarget(v: unknown): ViewerTarget | null {
  if (!record(v)) return null
  const from = readFrom(v.from)
  if (v.kind === 'attachment') {
    const taskKey = taskKeyOf(v.taskKey)
    if (!taskKey || typeof v.taskId !== 'string' || !ID.test(v.taskId) || typeof v.id !== 'string' || !ID.test(v.id)) return null
    return { kind: 'attachment', taskId: v.taskId, taskKey, id: v.id, from }
  }
  if (v.kind !== 'file') return null
  const ref = readFileRef(v.ref)
  if (!ref || ref.space === 'upload') return null
  const placePath = typeof v.placePath === 'string' && PLACE_PATH.test(v.placePath) ? v.placePath : null
  const taskKey = taskKeyOf(v.taskKey)
  return { kind: 'file', ref, placePath, ...(taskKey ? { taskKey } : {}), from }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
  } catch {
    return null
  }
}

export function writeViewerTarget(target: ViewerTarget): string {
  return toBase64Url(JSON.stringify(target))
}

/** The target an address names, or null when it names none or names one wrongly. */
export function viewerTargetOf(search: string): ViewerTarget | null {
  const value = new URLSearchParams(search).get(VIEWER_PARAM)
  if (!value || value.length > MAX_VALUE) return null
  const text = fromBase64Url(value)
  if (text === null) return null
  try {
    return readViewerTarget(JSON.parse(text))
  } catch {
    return null
  }
}

/** The search with the viewer's target set, or taken off when `target` is null; everything else kept. */
export function withViewer(search: string, target: ViewerTarget | null): string {
  const params = new URLSearchParams(search)
  if (target) params.set(VIEWER_PARAM, writeViewerTarget(target))
  else params.delete(VIEWER_PARAM)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Whether two targets name the same file, so opening it again changes nothing. */
export function sameTarget(a: ViewerTarget | null, b: ViewerTarget | null): boolean {
  return !!a && !!b && writeViewerTarget({ ...a, from: { kind: 'page' } }) === writeViewerTarget({ ...b, from: { kind: 'page' } })
}
