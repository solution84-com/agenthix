/**
 * What the viewer tells the page that framed it, by `postMessage`, only ever to hq's origin (named by the relay in the
 * page). The framed renderer in `ui` reads the same envelope and checks it came from the files origin. The page tells
 * the viewer one thing back: the path of a renewed ticket for the same file, which the viewer reads by from then on.
 */
import type { RendererReport } from '@agenthix/core'
import { isTicketPath } from './address'

export const VIEWER_MESSAGE_SOURCE = 'pdf-viewer'
export const VIEWER_MESSAGE_VERSION = 1

export type ViewerMessage = { source: typeof VIEWER_MESSAGE_SOURCE; version: 1; report?: RendererReport; pages?: number }

export function viewerMessage(body: { report?: RendererReport; pages?: number }): ViewerMessage {
  return { source: VIEWER_MESSAGE_SOURCE, version: VIEWER_MESSAGE_VERSION, ...body }
}

export const HOST_MESSAGE_SOURCE = 'pdf-viewer-host'

/** A renewed ticket's path from the framing page, or null for anything not exactly that shape and a ticket's path. */
export function readHostMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as { source?: unknown; version?: unknown; link?: unknown }
  if (m.source !== HOST_MESSAGE_SOURCE || m.version !== 1 || typeof m.link !== 'string') return null
  return isTicketPath(m.link) ? m.link : null
}
