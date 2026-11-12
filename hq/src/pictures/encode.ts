/**
 * Encoding a picture with sharp (ADR-0187): every stored picture, drawn or uploaded, is a full WebP and a small copy
 * at known sizes, decoded and written again so nothing of the input but its pixels survives (sharp drops metadata
 * unless told to keep it). The input pixel limit refuses a file built to expand enormously when decoded, before it is.
 */
import sharp, { type Sharp } from 'sharp'
import type { PictureKind } from '../shared/pictures/recipe'

export const PICTURE_SIZES: Record<PictureKind, { full: { width: number; height: number }; small: { width: number; height: number } }> = {
  avatar: { full: { width: 1024, height: 1024 }, small: { width: 256, height: 256 } },
  cover: { full: { width: 1500, height: 500 }, small: { width: 600, height: 200 } },
}

/**
 * The most pixels sharp will decode from one input: generous for any photo a 5 MB file holds (a 48-megapixel phone
 * photo is under it), far below what a decompression bomb expands to.
 */
export const MAX_INPUT_PIXELS = 50_000_000

export interface EncodedPicture {
  full: Buffer
  small: Buffer
}

/**
 * `cover`: filled and cropped to exactly the stored size (a drawing, or a picture already cropped to shape).
 * `inside`: scaled to fit within it, never enlarged (an upload whose shape is its own).
 */
export type EncodeFit = 'cover' | 'inside'

export function decode(input: Buffer, options: { density?: number } = {}): Sharp {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', ...options })
}

/** Encodes any picture sharp can read into the stored full WebP and its small copy. */
export async function encodePicture(input: Buffer, kind: PictureKind, fit: EncodeFit = 'cover'): Promise<EncodedPicture> {
  const { full: f, small: s } = PICTURE_SIZES[kind]
  const resize = fit === 'cover' ? { fit: 'cover' as const } : { fit: 'inside' as const, withoutEnlargement: true }
  const full = await decode(input).rotate().resize(f.width, f.height, resize).webp({ quality: 86 }).toBuffer()
  const small = await decode(full).resize(s.width, s.height, resize).webp({ quality: 80 }).toBuffer()
  return { full, small }
}

/** Rasterises an SVG at the density that makes it `width` wide, so it is drawn sharp rather than scaled up. */
export async function rasteriseSvg(svg: string, width: number): Promise<Buffer> {
  const input = Buffer.from(svg)
  const { width: intrinsic } = await decode(input).metadata()
  if (!intrinsic) throw new Error('The drawing has no size')
  const density = Math.min(72 * (width / intrinsic), 72 * 64)
  return decode(input, { density }).png().toBuffer()
}
