/**
 * Encoding a picture with sharp (ADR-0187): every stored picture, drawn or uploaded, is a full WebP and a small copy
 * at known sizes, decoded and written again so nothing of the input but its pixels survives (sharp drops metadata
 * unless told to keep it). The input pixel limit refuses a file built to expand enormously when decoded, before it is.
 */
import sharp, { type Sharp } from 'sharp'
import type { PictureKind } from '../shared/pictures/recipe'
import { STORED_SIZE, type Size } from '../shared/pictures/upload/sizing'

export const PICTURE_SIZES: Record<PictureKind, { full: Size; small: Size }> = {
  avatar: { full: STORED_SIZE.avatar, small: { width: 256, height: 256 } },
  cover: { full: STORED_SIZE.cover, small: { width: 600, height: 200 } },
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

/** The formats an upload may be in. Never SVG: an upload must not reach libvips' SVG loader (librsvg) at all. */
export const UPLOAD_FORMATS = ['jpeg', 'png', 'webp', 'gif', 'heif'] as const
export type UploadFormat = (typeof UPLOAD_FORMATS)[number]

export type UploadRefusal = 'format' | 'pixels' | 'unreadable'

/** Why an upload was refused, for the caller to say in words; sharp's own message is not shown to anyone. */
export class UploadRefused extends Error {
  constructor(readonly reason: UploadRefusal, detail: string) {
    super(`The upload was refused (${reason}): ${detail}`)
    this.name = 'UploadRefused'
  }
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis'])

/**
 * The format the file's first bytes name, or null for anything else. Checked before sharp sees the file, since even
 * reading an SVG's header runs its XML through librsvg.
 */
export function sniffUploadFormat(input: Buffer): UploadFormat | null {
  const ascii = (from: number, to: number) => input.subarray(from, to).toString('latin1')
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg'
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (input.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (input.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif'
  if (input.length >= 12 && ascii(4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(8, 12))) return 'heif'
  return null
}

/**
 * Encodes an upload: its first bytes and then sharp's reading of its header must both name one of
 * `UPLOAD_FORMATS`, before any pixel is decoded; then it is fitted inside the stored size, never enlarged.
 * Every refusal is an `UploadRefused`.
 */
export async function encodeUpload(input: Buffer, kind: PictureKind): Promise<EncodedPicture> {
  const sniffed = sniffUploadFormat(input)
  if (!sniffed) throw new UploadRefused('format', 'its first bytes name no picture format an upload may be in')
  try {
    const { format } = await decode(input).metadata()
    if (format !== sniffed) throw new UploadRefused('format', `read as ${format ?? 'nothing'}, not ${sniffed}`)
    return await encodePicture(input, kind, 'inside')
  } catch (err) {
    if (err instanceof UploadRefused) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new UploadRefused(/pixel limit/i.test(message) ? 'pixels' : 'unreadable', message)
  }
}

/** Rasterises an SVG at the density that makes it `width` wide, so it is drawn sharp rather than scaled up. */
export async function rasteriseSvg(svg: string, width: number): Promise<Buffer> {
  const input = Buffer.from(svg)
  const { width: intrinsic } = await decode(input).metadata()
  if (!intrinsic) throw new Error('The drawing has no size')
  const density = Math.min(72 * (width / intrinsic), 72 * 64)
  return decode(input, { density }).png().toBuffer()
}
