/**
 * The check name under the preview domain (`p-check.<domain>`, core's `PREVIEW_CHECK_ID`), which the relay answers
 * itself: the Fleet Console's third check asks it, through DNS, the certificate and whatever passes the name on, to
 * learn that an app's address really reaches the relay. It names no app, reads no cookie and reaches no site.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PREVIEW_CHECK_ANSWER, PREVIEW_CHECK_ID, appIdFromHost } from '@agenthix/core'
import { answerPlain } from './responseHeaders'

/** True when the request was for the check name, and it was answered. */
export function answerPreviewCheck(req: IncomingMessage, res: ServerResponse, previewPattern: string | null): boolean {
  if (!previewPattern || appIdFromHost(previewPattern, req.headers.host ?? '') !== PREVIEW_CHECK_ID) return false
  const headers = { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  if (req.method !== 'GET' && req.method !== 'HEAD') answerPlain(res, 405, 'Only GET is answered here.', { ...headers, Allow: 'GET, HEAD' })
  else answerPlain(res, 200, PREVIEW_CHECK_ANSWER, headers)
  return true
}
