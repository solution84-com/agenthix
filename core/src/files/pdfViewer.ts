/**
 * The two messages a PDF preview passes by `postMessage`, and the size it previews up to. The viewer page on the files
 * address sends `pdf-viewer` messages to the page that framed it; that page sends back `pdf-viewer-host` messages, each
 * the path of a renewed ticket for the same file. The relay's viewer and the shared PDF renderer both read these.
 */
import type { RendererFailure, RendererReport } from './contract.js'

/** A PDF is previewed up to 50 MB, read by range. */
export const PDF_PREVIEW_LIMIT = 50 * 1024 * 1024

export const PDF_VIEWER_MESSAGE_SOURCE = 'pdf-viewer'
export const PDF_VIEWER_HOST_MESSAGE_SOURCE = 'pdf-viewer-host'
export const PDF_VIEWER_MESSAGE_VERSION = 1

export type PdfViewerMessage = {
  source: typeof PDF_VIEWER_MESSAGE_SOURCE
  version: typeof PDF_VIEWER_MESSAGE_VERSION
  report?: RendererReport
  pages?: number
}

export type PdfViewerHostMessage = {
  source: typeof PDF_VIEWER_HOST_MESSAGE_SOURCE
  version: typeof PDF_VIEWER_MESSAGE_VERSION
  link: string
}

export function pdfViewerMessage(body: { report?: RendererReport; pages?: number }): PdfViewerMessage {
  return { source: PDF_VIEWER_MESSAGE_SOURCE, version: PDF_VIEWER_MESSAGE_VERSION, ...body }
}

export function pdfViewerHostMessage(link: string): PdfViewerHostMessage {
  return { source: PDF_VIEWER_HOST_MESSAGE_SOURCE, version: PDF_VIEWER_MESSAGE_VERSION, link }
}

const FAILURES: ReadonlySet<string> = new Set<RendererFailure>(['unreadable', 'too-large', 'changed', 'unavailable'])

/** The viewer's message, or null for anything not exactly its shape. The viewer reports ready or failed, never partial. */
export function readPdfViewerMessage(data: unknown): { report?: RendererReport; pages?: number } | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as { source?: unknown; version?: unknown; report?: unknown; pages?: unknown }
  if (m.source !== PDF_VIEWER_MESSAGE_SOURCE || m.version !== PDF_VIEWER_MESSAGE_VERSION) return null
  if (m.pages !== undefined) return Number.isSafeInteger(m.pages) && (m.pages as number) > 0 ? { pages: m.pages as number } : null
  const r = m.report as { state?: unknown; reason?: unknown } | undefined
  if (r?.state === 'ready') return { report: { state: 'ready' } }
  if (r?.state === 'failed' && typeof r.reason === 'string' && FAILURES.has(r.reason)) {
    return { report: { state: 'failed', reason: r.reason as RendererFailure } }
  }
  return null
}

/** The link in the framing page's message, or null for anything not exactly that shape. */
export function readPdfViewerHostMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as { source?: unknown; version?: unknown; link?: unknown }
  if (m.source !== PDF_VIEWER_HOST_MESSAGE_SOURCE || m.version !== PDF_VIEWER_MESSAGE_VERSION || typeof m.link !== 'string') return null
  return m.link
}
