/**
 * A browser's `Range` header, as the site reads it against the file's size (RFC 9110 §14). Only a single range of
 * bytes is served: anything else is ignored, which the RFC allows, and the whole file is sent.
 */

/** Inclusive offsets, as `Content-Range` has them. */
export type ByteRange = { start: number; end: number }

/** Longer than any single byte range can be written; a longer header is ignored. */
export const MAX_RANGE_HEADER_LENGTH = 64

/**
 * The range to serve; `null` to serve the whole file (no header, or one this does not serve); `'unsatisfiable'` when
 * a single range starts past the end (answered 416).
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header || header.length > MAX_RANGE_HEADER_LENGTH) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix === 0) return 'unsatisfiable'
    return size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? Number.MAX_SAFE_INTEGER : Number(m[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}
