/**
 * Image Handlers
 * ==============
 * Serves pictures from hq's own storage (close-out spec §6.5): an agent's
 * avatar and cover at <hqStorage>/agents/{agentId}/images/{uuid}.{ext}, and a
 * person's picture at <hqStorage>/people/{userId}/images/{uuid}.{ext}. They
 * are hq's own data — nothing a run reads — so they do not sit on a site's
 * disk, and serving one does not depend on a site being reachable.
 *
 * Served on the files origin, by a link HQ made for a signed-in person
 * (files/fileAccess.ts) — nothing more. An agent's or a person's picture is
 * org-wide content, shown wherever they appear, not scoped to any project or
 * task, so there is no membership rule to apply beyond being signed in at all.
 */
import type { Request, Response } from 'express'
import { getAgentImagesDir, getHqStorageRoot, getPersonImagesDir } from './hqStoragePaths'
import { resolveRealPathWithin } from './realPathWithin'
import { readerOf, sendUpload } from './files/fileAccess'
import fs from 'node:fs/promises'
import path from 'node:path'

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// UUID-named files: {nanoid}.{ext} — one file per upload, URL is the cache key
const VALID_FILENAME = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/

export function getAgentImage(req: Request, res: Response) {
  return serveImage(req, res, getAgentImagesDir((req.params as { agentId: string }).agentId))
}

export function getPersonImage(req: Request, res: Response) {
  return serveImage(req, res, getPersonImagesDir((req.params as { userId: string }).userId))
}

async function serveImage(req: Request, res: Response, dir: string) {
  const reader = readerOf(req, res)
  if (!reader) return
  if (!reader.userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { filename } = req.params as { filename: string }

  if (!VALID_FILENAME.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  const target = path.join(dir, filename)
  // hq's storage root is the boundary, not the image directory: the agent's
  // or person's id arrives in the URL, so it is the part of the path a request
  // can aim anywhere. Same symlink-aware check as before the move — a lexical one
  // would read through a link planted anywhere along the way.
  const real = await resolveRealPathWithin(getHqStorageRoot(), target)
  if (!real) return res.status(404).json({ error: 'Image not found' })

  try {
    const buf = await fs.readFile(real)
    const ext = path.extname(filename)
    // `private`, not `public`: the response is for the one link, and a shared
    // cache, CDN or proxy that stored it would replay it to a requester that
    // never held one. A browser keeps it while the link lives: the link is the
    // version, since one upload writes one file under its own uuid.
    return sendUpload(res, buf, {
      type: MIME_MAP[ext] ?? 'application/octet-stream', inline: true, filename, cache: 'private, max-age=600', reader,
    })
  } catch {
    return res.status(404).json({ error: 'Image not found' })
  }
}
