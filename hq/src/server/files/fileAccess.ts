/**
 * How an uploaded file is reached and how it is sent (host-management spec §16, adr-0114).
 *
 * - On HQ's own address, a signed-in person asks for a link (`GET /file-link?path=…`).
 * - The files origin serves the file to that link alone: never to a session, a cookie or HQ's own address, and
 *   always with a sandbox policy, `nosniff` and a `Content-Disposition`.
 * - Where HQ has no host name for files, the link is to HQ's own address and every file is a download.
 */
import type { NextFunction, Request, Response } from 'express'
import { checkLink, decodePath, makeLink } from './fileLinks'
import { filesPlace, isFilesHost } from './filesOrigin'
import { isUploadPath, mayBeShownBeforeSignIn } from './uploadPaths'

/** Who a link was made for (null: a file shown before sign-in), and whether it is to be a download. */
export type FileReader = { userId: string | null; download: boolean }

/**
 * The person a request to an uploaded file was linked for, or null after refusing it. The request must come to
 * the files origin (or, with none, to HQ's own address) and carry a link that is HQ's, unaltered and unexpired.
 */
export function readerOf(req: Request, res: Response, now = new Date()): FileReader | null {
  const place = filesPlace()
  if (place.mode === 'origin' && !isFilesHost(req.headers.host, place)) {
    res.status(404).json({ error: 'Not found' })
    return null
  }
  const path = decodePath(req.path)
  const check = path ? checkLink(path, req.query as Record<string, unknown>, now) : null
  if (!check?.ok) {
    if (check?.reason === 'expired') res.status(410).json({ error: 'This link has expired. Open the file again from HQ.' })
    else res.status(403).json({ error: 'This link is not valid.' })
    return null
  }
  return { userId: check.grant.userId, download: check.grant.download }
}

function dispositionFor(filename: string, attachment: boolean): string {
  if (!attachment) return 'inline'
  const plain = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * Sends an uploaded file. `inline` is whether its type may be shown at all; it is shown only from the files
 * origin, and never when the link asked for a download.
 */
export function sendUpload(
  res: Response,
  bytes: Buffer,
  file: { type: string; inline: boolean; filename: string; cache: string; reader: FileReader },
): void {
  const attachment = !file.inline || file.reader.download || filesPlace().mode !== 'origin'
  res.setHeader('Content-Type', file.type)
  res.setHeader('Content-Disposition', dispositionFor(file.filename, attachment))
  // No origin and no script for whatever the file turns out to be, and no type but the one decided here.
  res.setHeader('Content-Security-Policy', 'sandbox')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  // HQ's pages show pictures from the files origin, which is another origin.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cache-Control', file.cache)
  res.send(bytes)
}

/**
 * Before every route: on the files origin, nothing but an uploaded file is answered, and nothing of HQ's sign-in
 * is passed on, so no handler can act for a session there.
 */
export function filesHostGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isFilesHost(req.headers.host, filesPlace())) return next()
  delete req.headers.authorization
  delete req.headers.cookie
  const path = decodePath(req.path)
  if ((req.method === 'GET' || req.method === 'HEAD') && path && isUploadPath(path)) return next()
  res.status(404).type('text/plain').send('Not found')
}

/**
 * `GET /file-link?path=<file's path>[&download=1]`, on HQ's own address: a link for the signed-in person. Without
 * a session, only for a picture the sign-in page may show; the files origin still decides whether it does.
 */
export function fileLinkHandler(resolveUserId: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store')
    const raw = typeof req.query.path === 'string' ? req.query.path : ''
    const path = decodePath(raw.split('?')[0])
    if (!path || !isUploadPath(path)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const userId = await resolveUserId(req)
    if (!userId && !mayBeShownBeforeSignIn(path)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json(makeLink(filesPlace().origin, { path, userId, download: req.query.download === '1' }, new Date()))
  }
}
