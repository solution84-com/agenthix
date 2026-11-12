/**
 * `GET /file-link?path=<upload path>[&download=1][&size=small]`, on HQ's own address: a link to a file hq keeps
 * itself, served by hq's relay on a ticket (adr-0153). hq checks access here, signs an `upload` ticket for this person
 * and this file at the version on disk, records it (T11), and answers with the relay's link. hq-server never sends
 * the file.
 *
 * `size=small` (client protocol 1.22, ADR-0187) asks for a picture's small copy, `{uuid}-small.webp` beside it: the
 * ticket is signed for the small copy when it is there and may be opened, else for the picture itself. Access to the
 * picture itself is checked first, so the small link refuses exactly what the full one does.
 *
 * Without a session, a link is made only for a picture the sign-in page shows, on a ticket that names no person.
 */
import type { Request, Response } from 'express'
import { fileTicketLink, fileVersion, type FileTicketInput, type RelayAddress } from '@agenthix/core'
import { isSmallPictureName, smallPictureName } from '../../shared/pictures/files'
import type { UploadAccess } from './uploadAccess'

export type UploadLinkDeps = {
  resolveUserId(req: Request): Promise<string | null>
  access(uploadPath: string, userId: string | null): Promise<UploadAccess>
  /** hq's relay while it is connected to hq and has an address a browser reaches; null otherwise. */
  hqRelay(): Promise<{ id: string; address: RelayAddress } | null>
  issue(input: FileTicketInput): Promise<{ token: string; expiresAt: number }>
}

export const RELAY_UNAVAILABLE =
  "Files can't be opened right now: HQ's relay isn't connected to HQ. Ask an admin of HQ to check HQ's relay, then try again."

/** A request's path back to its stored form, or null when it does not decode. */
export function decodePath(raw: string): string | null {
  try {
    return raw.split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

/**
 * The small copy's path for a stored picture's (an agent's, a person's, a team's or the organisation's), or null for
 * a task attachment, a small copy itself, or any name `writePicture` does not write.
 */
export function smallPicturePath(uploadPath: string): string | null {
  if (uploadPath.startsWith('/files/')) return null
  const slash = uploadPath.lastIndexOf('/')
  const name = uploadPath.slice(slash + 1)
  if (!/^[a-zA-Z0-9_-]+\.webp$/.test(name) || isSmallPictureName(name)) return null
  return `${uploadPath.slice(0, slash + 1)}${smallPictureName(name)}`
}

export function uploadLinkHandler(deps: UploadLinkDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store')
    const raw = typeof req.query.path === 'string' ? req.query.path : ''
    const path = decodePath(raw.split('?')[0])
    if (!path) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const userId = await deps.resolveUserId(req)
    const full = await deps.access(path, userId)
    if (!full.ok) {
      res.status(full.status).json({ error: full.status === 401 ? 'Unauthorized' : 'Not found' })
      return
    }
    const small = req.query.size === 'small' ? smallPicturePath(path) : null
    const smallAccess = small ? await deps.access(small, userId) : null
    const served = small && smallAccess?.ok ? { path: small, stat: smallAccess.stat } : { path, stat: full.stat }
    const relay = await deps.hqRelay()
    if (!relay) {
      res.status(503).json({ error: RELAY_UNAVAILABLE })
      return
    }
    const { token, expiresAt } = await deps.issue({
      space: 'upload',
      path: served.path,
      purpose: req.query.download === '1' ? 'download' : 'preview',
      version: fileVersion(served.stat.size, served.stat.mtimeMs),
      person: userId,
      relay: relay.id,
    })
    res.json({ url: fileTicketLink(relay.address, token), expiresAt: new Date(expiresAt).toISOString() })
  }
}
