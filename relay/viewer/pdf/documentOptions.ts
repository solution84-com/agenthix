/**
 * How pdf.js opens a file (spec part 2, part 6 T7). Only pdf.js's display API is used — never its viewer component,
 * its scripting manager or its sandbox — so a script a PDF carries has nothing that would run it; XFA forms are off,
 * and the page's policy allows no eval. Bytes are read by range, page by page, through the viewer's own transport
 * (`ticketSource.ts`), from the ticket on this origin that is live at the time of each read.
 */
import type { RendererFailure } from '@agenthix/core'

export const VIEWER_ROOT = '/viewer/pdf'
/** Part 6, caps: a PDF is previewed up to 50 MB, read by range. */
export const PDF_PREVIEW_LIMIT = 50 * 1024 * 1024
const RANGE_CHUNK = 256 * 1024

export const RANGE_CHUNK_SIZE = RANGE_CHUNK

export function documentOptions(origin: string) {
  const own = (path: string) => `${origin}${VIEWER_ROOT}/${path}/`
  return {
    withCredentials: false,
    rangeChunkSize: RANGE_CHUNK,
    disableRange: false,
    disableStream: true,
    disableAutoFetch: true,
    enableXfa: false,
    cMapUrl: own('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: own('standard_fonts'),
    wasmUrl: own('wasm'),
    iccUrl: own('iccs'),
    useWasm: true,
  }
}

/** pdf.js's errors by name (its classes are not shared across its worker), as a renderer's failure. */
export function failureOfError(error: unknown): RendererFailure {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { name?: unknown; status?: unknown }
  if (e.name === 'ResponseException' || e.name === 'TicketReadError') return e.status === 409 ? 'changed' : 'unavailable'
  if (e.name === 'InvalidPDFException' || e.name === 'PasswordException' || e.name === 'FormatError') return 'unreadable'
  return 'unavailable'
}
