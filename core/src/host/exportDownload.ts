/**
 * An export made from the Fleet Console reaches the person who made it (host-management spec §12: an export is
 * "wherever the person takes it"). The machine holds the sealed file in its state folder; the Fleet Console reads it
 * a chunk at a time with `backup.exportRead` and streams it to the person's browser, keeping no copy, then says
 * `backup.exportDone` and the machine removes its own. One never downloaded is removed after `EXPORT_HELD_MS`.
 *
 * Each chunk is the answer to a command, so it travels as every answer does: signed by the machine and sealed to the
 * Fleet Console, which takes it only from the machine it asked (`HostEnvelope`). hq passes it and can neither read it
 * nor alter it — and the file inside is sealed again, to the key made for the export, which hq never sees.
 */

/** The bytes one `backup.exportRead` answers with; with its envelope, well under `HOST_ENVELOPE_MAX_BODY_BYTES`. */
export const EXPORT_CHUNK_BYTES = 512 * 1024

/** How long the machine holds an export nobody downloaded. */
export const EXPORT_HELD_MS = 24 * 60 * 60_000

/** `backup.exportRead`'s answer: the bytes from `offset`, base64url, and whether they are the end of the file. */
export type ExportChunk = { exportId: string; offset: number; sizeBytes: number; last: boolean; data: string }

const EXPORT_ID = /^[a-z0-9][a-z0-9-]{0,150}-\d{8}T\d{6}Z-export-[0-9a-f]{8}\.sealed$/
const B64URL = /^[A-Za-z0-9_-]*$/

/** An export's file name, which is its id; never a path. */
export function isExportId(v: unknown): v is string {
  return typeof v === 'string' && EXPORT_ID.test(v)
}

const decodedLength = (data: string): number | null =>
  B64URL.test(data) && data.length % 4 !== 1 ? Math.floor((data.length * 3) / 4) : null

/**
 * What is wrong with a chunk as the answer to what was asked, in words; null when nothing is. `sizeBytes` is the
 * size the first chunk gave, null for the first: every chunk after must give the same.
 */
export function exportChunkProblem(v: unknown, asked: { exportId: string; offset: number; sizeBytes: number | null }): string | null {
  const c = v as Partial<ExportChunk> | null
  if (!c || typeof c !== 'object' || c.exportId !== asked.exportId) return 'The machine answered with another export.'
  if (c.offset !== asked.offset) return 'The machine answered with another part of the export.'
  const size = c.sizeBytes
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) return 'The machine gave no size for the export.'
  if (asked.sizeBytes !== null && size !== asked.sizeBytes) return 'The export changed size on the machine while it was downloaded.'
  const length = typeof c.data === 'string' ? decodedLength(c.data) : null
  if (length === null) return 'The machine answered with something that is not part of a file.'
  const expected = Math.min(EXPORT_CHUNK_BYTES, size - asked.offset)
  if (expected <= 0 || length !== expected) return 'A part of the export arrived cut short.'
  if (c.last !== (asked.offset + length === size)) return 'The machine said wrongly where the export ends.'
  return null
}
