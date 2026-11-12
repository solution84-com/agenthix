/**
 * The one way a picture chosen in the browser is made ready to send (ADR-0187): cut out the frame (a crop the person
 * made, or the centre of the picture in the frame's shape), scale it to the stored size without enlarging it, and
 * encode it as WebP. Only that is sent; the rest of the photo never leaves the device. The server re-encodes it
 * anyway: this is a convenience, not a check.
 */
import type { PictureKind } from '../recipe'
import { cropPlan, type CropRect, type Size } from './sizing'

/** What hq accepts in one upload (`server/imageUpload.ts`). */
export const MAX_SENT_BYTES = 5 * 1024 * 1024

export const MAX_CHOSEN_BYTES = 10 * 1024 * 1024
const CHOSEN_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Why a chosen file cannot be used, checked before anything is read; null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!CHOSEN_TYPES.includes(file.type)) return 'Choose a PNG, JPG or WebP image.'
  if (file.size > MAX_CHOSEN_BYTES) return 'That image is over 10 MB. Choose a smaller one.'
  return null
}

export const NOT_READABLE = 'That file could not be read as a picture. Choose another.'
export const TOO_LARGE_TO_SEND = 'That picture is still too large to send. Choose a smaller one.'

type Drawable = { source: CanvasImageSource; size: Size; close(): void }

/** The picture decoded, turned upright by its own orientation where the browser does that. */
async function open(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, size: { width: bitmap.width, height: bitmap.height }, close: () => bitmap.close() }
    } catch {
      // Fall through to an <img>, which opens some formats a bitmap does not.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(NOT_READABLE))
      el.src = url
    })
    return { source: img, size: { width: img.naturalWidth, height: img.naturalHeight }, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type CropOptions = {
  /** The frame on the picture, in its pixels; left out, the centre of the picture in the frame's shape. */
  crop?: CropRect | null
  /** Refuse a picture whose shorter side is under this many pixels. */
  minSide?: number
}

/** Cuts, scales and encodes a chosen picture for `kind`, as a data URL ready for an upload action. */
export async function cropAndCompress(file: Blob, kind: PictureKind, options: CropOptions = {}): Promise<string> {
  let picture: Drawable
  try {
    picture = await open(file)
  } catch {
    throw new Error(NOT_READABLE)
  }
  try {
    const { minSide = 0 } = options
    if (Math.min(picture.size.width, picture.size.height) < minSide) {
      throw new Error(`That image is too small. Choose one at least ${minSide}×${minSide}.`)
    }
    const { rect, output } = cropPlan(picture.size, kind, options.crop)
    const canvas = document.createElement('canvas')
    canvas.width = output.width
    canvas.height = output.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error(NOT_READABLE)
    context.imageSmoothingQuality = 'high'
    context.drawImage(picture.source, rect.x, rect.y, rect.width, rect.height, 0, 0, output.width, output.height)
    // A browser that cannot encode WebP answers with a PNG; a JPEG is much the smaller of the two.
    let dataUrl = canvas.toDataURL('image/webp', 0.86)
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    if (dataUrlBytes(dataUrl) > MAX_SENT_BYTES) throw new Error(TOO_LARGE_TO_SEND)
    return dataUrl
  } finally {
    picture.close()
  }
}

/** The bytes a base64 data URL carries. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
}
