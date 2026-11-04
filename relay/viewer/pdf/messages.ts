/**
 * What the viewer tells the page that framed it, by `postMessage`, only ever to hq's origin (named by the relay in the
 * page). The shapes are core's, shared with the framed renderer in `ui`, which checks it came from the files origin. The
 * page tells the viewer one thing back: the path of a renewed ticket for the same file, which the viewer reads by from
 * then on.
 */
import { pdfViewerMessage, readPdfViewerHostMessage } from '@agenthix/core/pdf-viewer'
import { isTicketPath } from './address'

export { pdfViewerMessage as viewerMessage }

/** A renewed ticket's path from the framing page, or null for anything not exactly that shape and a ticket's path. */
export function readHostMessage(data: unknown): string | null {
  const link = readPdfViewerHostMessage(data)
  return link !== null && isTicketPath(link) ? link : null
}
