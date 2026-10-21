/**
 * File Serving Handlers
 * =====================
 *
 * Task attachments — what a person or an agent attached to a task:
 *    - GET /files/task/:taskId/:uuid/*, on the files origin, by a link HQ made
 *      (files/fileAccess.ts) for a member of the task's project.
 *    - On hq's own storage, typed from the file's extension. Anything unmapped
 *      is an opaque download, never inline text.
 *
 * Nothing here reaches an Execution Site's disk. An agent's artefacts are
 * listed and read through the storage queries (`../storage/ownerFolderQueries.ts`),
 * which cross the channel to the site that holds them.
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import type { Request, Response } from 'express'
import { getHqStorageRoot, getTaskAttachmentDir } from './hqStoragePaths'
import { requireProjectMember } from '../projects/membership'
import { resolveRealPathWithin } from './realPathWithin'
import { prisma } from 'wasp/server'
import { readerOf, sendUpload } from './files/fileAccess'

/**
 * Express 5 changed wildcard params from req.params[0] (string) to
 * req.params.path (string | string[]). Normalise to a plain string.
 */
function wildcardPath(req: Request): string {
  const p = (req.params as Record<string, string | string[]>)['path']
  if (Array.isArray(p)) return p.join('/')
  return p ?? ''
}

/**
 * The containment base for one task's attachments: the task's own directory
 * under hq's storage. The uuid directory below it is not the base, because the
 * route is addressed by both and a request is contained to the task, not to one
 * upload within it.
 *
 * Returns null when the taskId itself climbs out of `tasks/`.
 */
function taskAttachmentsBase(taskId: string): string | null {
  const tasksBase = path.resolve(getHqStorageRoot(), 'tasks')
  const taskBase = path.resolve(tasksBase, taskId)
  return taskBase.startsWith(tasksBase + path.sep) ? taskBase : null
}

/**
 * Resolves and validates a request path within a task's attachment directory.
 * Attachments live at tasks/<taskId>/<uuid>/<filename> on hq's own storage —
 * the same path the upload writes, built by the same helper.
 *
 * Returns the canonicalized absolute path when the resolved path stays within
 * that task's own directory. Returns null for empty input or traversal.
 */
export function resolveTaskArtefactPath(
  taskId: string,
  uuid: string,
  requestedPath: string
): string | null {
  if (!requestedPath) return null

  // Two-level sandbox: first check taskId doesn't escape tasks/, then check
  // the full path doesn't escape the task's own directory.
  const taskBase = taskAttachmentsBase(taskId)
  if (!taskBase) return null

  const resolved = path.resolve(getTaskAttachmentDir(taskId, uuid), requestedPath)
  if (!resolved.startsWith(taskBase + path.sep)) return null

  return resolved
}

/**
 * The content type an attachment is served with, decided from its extension and
 * never from its bytes. Sniffing is what the `nosniff` header (files/fileAccess.ts) exists to
 * stop, so this side must not do it either.
 *
 * Anything absent from this map is `application/octet-stream` served as an
 * attachment. A person may upload any file at all, and an unmapped one served
 * inline as text is how an uploaded `.html` becomes a script running on hq's own
 * origin, with hq's own session cookies. The map holds only types that are
 * either inert or rendered by the browser as data.
 */
const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
}

function attachmentContentType(requestedPath: string): { type: string; disposition: string } {
  const mapped = ATTACHMENT_CONTENT_TYPES[path.extname(requestedPath).toLowerCase()]
  return mapped
    ? { type: mapped, disposition: 'inline' }
    : { type: 'application/octet-stream', disposition: 'attachment' }
}

/**
 * Validates a Wasp user session from the Authorization: Bearer <sessionId>
 * header and returns whose it is, or null when there is none. These endpoints
 * are registered outside Wasp's router, so req.user is not populated
 * automatically. Used on HQ's own address only — where a link to a file is
 * made (files/fileAccess.ts) — never where a file is served.
 */
export async function resolveSessionUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const sessionId = authHeader.substring(7)
  // Dynamic import avoids a static dependency on wasp/auth/session, which
  // chains through wasp/auth/utils → wasp/server/utils and breaks test
  // files that don't alias those modules.
  const { getSessionAndUserFromSessionId } = await import('wasp/auth/session')
  const result = await getSessionAndUserFromSessionId(sessionId)
  return result?.user?.id ?? null
}

/**
 * GET handler for task attachments.
 * Route: GET /files/task/:taskId/:uuid/*
 *
 * Requires a link HQ made (files/fileAccess.ts) for a person who is, still, a
 * member of the project the task belongs to — the same entitlement the task
 * itself is read under.
 *
 * The order is the point: the link is checked, the task is resolved, its
 * project is resolved, and membership is decided before anything touches the
 * filesystem. A route that answers "does this attachment exist" ahead of the
 * check has already told someone not entitled to ask.
 */
export async function getTaskFile(req: Request, res: Response): Promise<void> {
  const reader = readerOf(req, res)
  if (!reader) return
  const userId = reader.userId
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const taskId = req.params.taskId as string
  const uuid = req.params.uuid as string
  const requestedPath = wildcardPath(req)

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true } })
  if (!task) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  try {
    await requireProjectMember(task.projectId, userId, "Downloading this task's attachment")
  } catch (err: unknown) {
    sendAccessRefusal(res, err)
    return
  }

  const resolved = resolveTaskArtefactPath(taskId, uuid, requestedPath)
  const taskBase = taskAttachmentsBase(taskId)
  // Real-path confinement as well as the lexical check, against the one
  // directory above the uploads.
  const real = resolved && taskBase ? await resolveRealPathWithin(taskBase, resolved) : null

  if (!real) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  try {
    const content = await fs.readFile(real)
    const { type, disposition } = attachmentContentType(requestedPath)
    // Entitlement is decided per request, so the response must not outlive the
    // request in a shared cache where an unentitled one could be served it.
    sendUpload(res, content, {
      type, inline: disposition === 'inline', filename: path.basename(requestedPath), cache: 'private, no-store', reader,
    })
  } catch (err: unknown) {
    if (isEnoent(err)) {
      res.status(404).json({ error: 'Not found' })
    } else {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Forwards the location rule's own refusal — its status and its wording — rather
 * than restating the rule here in a second form that could disagree with it.
 * Anything it threw that is not one of its refusals is a fault rather than a
 * decision, and is reported as one.
 */
function sendAccessRefusal(res: Response, err: unknown): void {
  const refusal = err as { statusCode?: unknown; message?: unknown }
  if (typeof refusal?.statusCode === 'number') {
    res.status(refusal.statusCode).json({ error: String(refusal.message ?? 'Forbidden') })
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT'
}
