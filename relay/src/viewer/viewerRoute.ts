/**
 * `GET`/`HEAD /viewer/pdf` and its files, on the files host only (spec part 2): the page a framed renderer loads to
 * draw a PDF with pdf.js. Anywhere else the path is not answered here, and falls through to the relay's 404.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isFilesHost } from '../filesHost'
import { answerPlain, setCommonHeaders } from '../http/responseHeaders'
import type { ViewerAssets } from './viewerAssets'
import { VIEWER_ROOT, VIEWER_WORKER_POLICY, viewerPage, viewerPagePolicy } from './viewerPolicy'

export const VIEWER_PAGE_PATH = VIEWER_ROOT
const ASSET_PREFIX = `${VIEWER_ROOT}/`
const WORKER = 'pdf.worker.mjs'

export type ViewerDeps = { viewer: ViewerAssets | null; filesHost: string | null; appOrigin: string | null }

export function isViewerPath(path: string): boolean {
  return path === VIEWER_PAGE_PATH || path.startsWith(ASSET_PREFIX)
}

/** Answers the viewer's paths on the files host; false when this request is not one of them. */
export function answerViewer(req: IncomingMessage, res: ServerResponse, path: string, deps: ViewerDeps): boolean {
  if (!isViewerPath(path) || !isFilesHost(req.headers.host, deps.filesHost) || !deps.appOrigin) return false
  const refuse = (status: number, text: string, headers: Record<string, string> = {}) => {
    setCommonHeaders(req, res, null)
    answerPlain(res, status, text, headers)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    refuse(405, 'Only GET and HEAD are answered here. Nothing was changed.', { Allow: 'GET, HEAD' })
    return true
  }
  if (!deps.viewer) {
    refuse(404, 'The PDF viewer is not built into this relay. Download the file instead.')
    return true
  }

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-cache')
  if (path === VIEWER_PAGE_PATH) {
    const body = viewerPage(deps.appOrigin)
    res.setHeader('Content-Security-Policy', viewerPagePolicy(deps.appOrigin))
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Length', String(Buffer.byteLength(body)))
    res.writeHead(200)
    res.end(req.method === 'HEAD' ? undefined : body)
    return true
  }

  const name = path.slice(ASSET_PREFIX.length)
  const asset = deps.viewer.get(name)
  if (!asset) {
    refuse(404, 'Not found.')
    return true
  }
  res.setHeader('Content-Security-Policy', name === WORKER ? VIEWER_WORKER_POLICY : viewerPagePolicy(deps.appOrigin))
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('ETag', asset.etag)
  if (req.headers['if-none-match'] === asset.etag) {
    res.writeHead(304)
    res.end()
    return true
  }
  res.setHeader('Content-Type', asset.contentType)
  res.setHeader('Content-Length', String(asset.body.length))
  res.writeHead(200)
  res.end(req.method === 'HEAD' ? undefined : asset.body)
  return true
}
