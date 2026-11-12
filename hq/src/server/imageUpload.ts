/**
 * One uploaded picture written to hq's own storage (ADR-0187): an agent's, a person's, a team's or the organisation's
 * avatar or cover. The browser sends it as a data URL, already cropped and compressed; that is a convenience, not a
 * check. Here its declared type and size are checked, and sharp decodes it and writes it again as the stored full
 * WebP and its small copy (`encodeUpload`), so only its pixels survive — a photo's location among the metadata
 * dropped — and a file that is not a raster picture (an SVG among them), or one built to expand enormously when
 * decoded, is refused. The files go through `writePicture` under a fresh uuid, its containment check against hq's
 * storage root the boundary.
 */
import { HttpError } from 'wasp/server'
import type { PictureKind } from '../shared/pictures/recipe'
import { encodeUpload, UploadRefused, type EncodedPicture } from '../pictures/encode'
import { writePicture, type WrittenPicture } from '../pictures/writePicture'
import { Logger } from './utils/logger'

const logger = new Logger('Uploads')

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const NOT_A_PICTURE = 'That file could not be read as a picture. Choose a PNG, JPEG or WebP image.'
export const PICTURE_TOO_LARGE = 'That picture is too large to use. Choose a smaller one.'

/** The bytes a data URL carries, after its declared type and size are checked. */
export function imageBytesFromDataUrl(dataUrl: unknown): Buffer {
  const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) : null
  if (!match) throw new HttpError(400, 'Invalid image data URL')
  const buf = Buffer.from(match[2], 'base64')
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'Image too large (max 5 MB)')
  return buf
}

/** The refusal of the input, as a 400 the person can act on; anything else is hq's own failure. */
async function reencode(buf: Buffer, kind: PictureKind): Promise<EncodedPicture> {
  try {
    return await encodeUpload(buf, kind)
  } catch (err) {
    if (!(err instanceof UploadRefused)) throw err
    logger.warn(err.message)
    throw new HttpError(400, err.reason === 'pixels' ? PICTURE_TOO_LARGE : NOT_A_PICTURE)
  }
}

/** Writes an uploaded picture under `dir`; the caller records `fileName` on the row and clears that picture's recipe. */
export async function writeUploadedPicture(dir: string, dataUrl: unknown, kind: PictureKind): Promise<WrittenPicture> {
  const picture = await reencode(imageBytesFromDataUrl(dataUrl), kind)
  return writePicture(dir, { type: 'encoded', picture })
}
