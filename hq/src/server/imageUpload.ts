/**
 * One uploaded picture written to hq's own storage (close-out spec §6.5): an
 * agent's avatar or cover, or a person's picture. The browser sends it as a
 * data URL; it is checked for type and size, written under a fresh uuid — so
 * its URL is its version — and the file name is returned for the caller to
 * record. The containment check against hq's storage root is the boundary
 * (realPathWithin.ts), whatever directory the caller names.
 */
import { HttpError } from 'wasp/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { resolveRealWriteTargetWithin } from './realPathWithin'
import { getHqStorageRoot } from './hqStoragePaths'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export async function writeImageFromDataUrl(dir: string, dataUrl: string): Promise<string> {
  const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) : null
  if (!match) throw new HttpError(400, 'Invalid image data URL')
  const [, mimeType, b64] = match
  const buf = Buffer.from(b64, 'base64')
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'Image too large (max 5 MB)')

  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp'
  const filename = `${crypto.randomUUID()}.${ext}`
  const target = await resolveRealWriteTargetWithin(getHqStorageRoot(), path.join(dir, filename))
  if (!target) throw new HttpError(403, 'Path not allowed')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, buf)
  return filename
}
