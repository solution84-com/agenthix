import { useEffect, useRef, useState } from 'react'
import type { RendererReport } from '@agenthix/core'
import type { Renderer, RendererProps } from '../../renderer'

/** Part 6, caps: a PDF is previewed up to 50 MB, read by range. */
const PDF_LIMIT = 50 * 1024 * 1024
const VIEWER_PATH = '/viewer/pdf'
const TICKET_PATH = /^\/t\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
const FAILURES = new Set(['unreadable', 'too-large', 'changed', 'unavailable'])

/**
 * The viewer page for a preview link: the same files origin, its viewer path, and the ticket's path in the fragment —
 * which a browser never sends, so no log keeps it. Null for anything but a ticket on an http(s) files address.
 */
export function viewerSource(link: string, theme: 'light' | 'dark'): { origin: string; src: string } | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || !TICKET_PATH.test(url.pathname)) return null
  // The frame is sandboxed with allow-same-origin: on hq's own origin that would give the viewer hq's page. Refuse.
  if (url.origin === globalThis.location?.origin) return null
  const fragment = new URLSearchParams({ link: url.pathname, theme })
  return { origin: url.origin, src: `${url.origin}${VIEWER_PATH}#${fragment}` }
}

/** The viewer's message, or null for anything not exactly its shape. The viewer reports ready or failed, never partial. */
function readMessage(data: unknown): { report?: RendererReport; pages?: number } | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as { source?: unknown; version?: unknown; report?: unknown; pages?: unknown }
  if (m.source !== 'pdf-viewer' || m.version !== 1) return null
  if (m.pages !== undefined) return Number.isSafeInteger(m.pages) && (m.pages as number) > 0 ? { pages: m.pages as number } : null
  const r = m.report as { state?: unknown; reason?: unknown } | undefined
  if (r?.state === 'ready') return { report: { state: 'ready' } }
  if (r?.state === 'failed' && typeof r.reason === 'string' && FAILURES.has(r.reason)) {
    return { report: { state: 'failed', reason: r.reason as 'unreadable' | 'too-large' | 'changed' | 'unavailable' } }
  }
  return null
}

/** What hq's page tells the viewer: a renewed ticket's path, on the viewer's own origin. Mirrors the relay's `messages.ts`. */
const hostMessage = (link: string) => ({ source: 'pdf-viewer-host', version: 1, link })

const themeOfPage = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/**
 * A PDF, drawn by pdf.js in the viewer page on the files address (spec part 2, *Where it runs*): active code runs only
 * there, an origin with no session of hq's. The frame is sandboxed to scripts and its own origin, which pdf.js needs to
 * read the ticket by range and start its worker; it reports by `postMessage`, taken only from that frame and origin,
 * and is told each renewed ticket the same way, sent only to that frame and origin.
 */
function PdfFrame({ facts, link, report, fact }: RendererProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  // The page is loaded once, from the first ticket; a renewed one goes to it by message, so it keeps its page.
  const [first] = useState(link)
  const handed = useRef(link)
  const tooLarge = facts.size > PDF_LIMIT
  const source = tooLarge ? null : viewerSource(first, themeOfPage())
  const origin = source?.origin

  useEffect(() => {
    if (link === handed.current || !origin) return
    const target = frame.current?.contentWindow
    const renewed = viewerSource(link, 'light')
    // A ticket on another files address cannot serve this page; its reads fail once the old one ends, and say so.
    if (!target || renewed?.origin !== origin) return
    handed.current = link
    target.postMessage(hostMessage(new URL(link).pathname), origin)
  }, [link, origin])

  useEffect(() => {
    if (tooLarge) {
      report({ state: 'failed', reason: 'too-large' })
      return
    }
    if (!origin) {
      report({ state: 'failed', reason: 'unavailable' })
      return
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || !frame.current || event.source !== frame.current.contentWindow) return
      const message = readMessage(event.data)
      if (message?.pages) fact(`${message.pages.toLocaleString('en-GB')} ${message.pages === 1 ? 'page' : 'pages'}`)
      if (message?.report) report(message.report)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [tooLarge, origin, report, fact])

  if (!source) return null
  return (
    <iframe
      ref={frame}
      title={facts.name}
      src={source.src}
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      className="block h-[75vh] w-full rounded-md border border-border bg-surface-0"
    />
  )
}

export const pdfRenderer: Renderer = {
  id: 'pdf',
  kinds: ['pdf'],
  runs: 'frame',
  previewLimit: PDF_LIMIT,
  embeds: false,
  viewer: VIEWER_PATH,
  render: props => <PdfFrame {...props} />,
}
