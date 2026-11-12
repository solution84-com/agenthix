/**
 * The pure arithmetic of an upload's crop (ADR-0187, *Upload: crop, then a small file*): where the frame falls on the
 * picture, and the size it is scaled to. The stored sizes are the server's too (`pictures/encode.ts`).
 */
import type { PictureKind } from '../recipe'

export type Size = { width: number; height: number }

/** A rectangle of the source picture, in its own pixels. */
export type CropRect = { x: number; y: number; width: number; height: number }

/** The full picture hq stores: avatar 1024 × 1024, cover 1500 × 500. */
export const STORED_SIZE: Record<PictureKind, Size> = {
  avatar: { width: 1024, height: 1024 },
  cover: { width: 1500, height: 500 },
}

/** Width over height of the frame each picture is shown in: a circle's square, a 3 : 1 band. */
export const FRAME_ASPECT: Record<PictureKind, number> = {
  avatar: STORED_SIZE.avatar.width / STORED_SIZE.avatar.height,
  cover: STORED_SIZE.cover.width / STORED_SIZE.cover.height,
}

/** The largest rectangle of the frame's shape in the middle of the picture: what is kept when nothing was cropped. */
export function centreCoverRect(source: Size, aspect: number): CropRect {
  const width = Math.min(source.width, source.height * aspect)
  const height = width / aspect
  return { x: (source.width - width) / 2, y: (source.height - height) / 2, width, height }
}

/** A crop kept inside the picture, at least a pixel each way, in whole pixels. */
export function clampRect(rect: CropRect, source: Size): CropRect {
  const x = Math.min(Math.max(0, Math.round(rect.x)), source.width - 1)
  const y = Math.min(Math.max(0, Math.round(rect.y)), source.height - 1)
  const width = Math.max(1, Math.min(Math.round(rect.width), source.width - x))
  const height = Math.max(1, Math.min(Math.round(rect.height), source.height - y))
  return { x, y, width, height }
}

/** The size the cut-out is drawn at: scaled down to fit the stored size, never enlarged. */
export function outputSize(rect: Size, kind: PictureKind): Size {
  const target = STORED_SIZE[kind]
  const scale = Math.min(target.width / rect.width, target.height / rect.height, 1)
  return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) }
}

/** Where to cut and how large to draw it: the crop given, or the centre of the picture in the frame's shape. */
export function cropPlan(source: Size, kind: PictureKind, crop?: CropRect | null): { rect: CropRect; output: Size } {
  const rect = clampRect(crop ?? centreCoverRect(source, FRAME_ASPECT[kind]), source)
  return { rect, output: outputSize(rect, kind) }
}
