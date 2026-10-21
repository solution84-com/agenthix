/**
 * The answers and errors of Cloud's endpoints that are not the device flow's, and the status each is sent with, so
 * Cloud's server and hq read them the same way.
 *
 * - **The form-encoded endpoints** (`/connect/device`, `/connect/token`, `/connect/revoke`, `/connect/address`) refuse
 *   with RFC 6749's error shape, `CloudConnectError` (./connection.ts): 401 for `invalid_client`, 400 for the rest.
 * - **The JSON endpoints** called with a bearer access token (`/connect/notices/downtime`, `/connect/pledge/status`)
 *   refuse with `CloudBearerError`: 401 `invalid_token` for a token Cloud did not issue, that lapsed, or whose client
 *   was revoked (RFC 6750 §3.1; hq signs for a fresh token and asks once more); 400 `invalid_request` for a body that
 *   is not the shape; 404 `not_found` from the pledge status for an account with no link to that hq.
 * - **Any endpoint** may answer 429 with `Retry-After` (seconds or an HTTP date, RFC 9110 §10.2.3). hq then asks
 *   nothing of Cloud until it has passed: `CLOUD_RETRY_AFTER_DEFAULT_S` when the header says neither, and never longer
 *   than `CLOUD_RETRY_AFTER_MAX_S`, so a wrong header cannot stop hq for good.
 * - **Any endpoint** may answer 426 when hq's protocol version is one Cloud does not serve (./version.ts).
 * - Any other status, or a body that is not JSON, hq reads as Cloud being away.
 */
import type { CloudConnectErrorCode } from './connection.js'

export type CloudBearerErrorCode = 'invalid_token' | 'invalid_request' | 'not_found'

export type CloudBearerError = { error: CloudBearerErrorCode; error_description?: string }

export const CLOUD_ERROR_STATUS: Readonly<Record<CloudConnectErrorCode | CloudBearerErrorCode, number>> = {
  authorization_pending: 400,
  slow_down: 400,
  access_denied: 400,
  expired_token: 400,
  invalid_grant: 400,
  invalid_request: 400,
  unsupported_grant_type: 400,
  invalid_client: 401,
  invalid_token: 401,
  not_found: 404,
}

export const CLOUD_BUSY_STATUS = 429
export const CLOUD_RETRY_AFTER_DEFAULT_S = 60
export const CLOUD_RETRY_AFTER_MAX_S = 3600

/** `POST /connect/notices/downtime`'s answer (200): the notice is kept, replacing any with the same `notice_id`. */
export type CloudDowntimeAccepted = { accepted: true }

const BEARER_ERRORS = new Set<string>(['invalid_token', 'invalid_request', 'not_found'])

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function parseCloudBearerError(v: unknown): CloudBearerError | null {
  const d = record(v)
  if (!d || typeof d.error !== 'string' || !BEARER_ERRORS.has(d.error)) return null
  const description = typeof d.error_description === 'string' ? d.error_description.slice(0, 500) : undefined
  return { error: d.error as CloudBearerErrorCode, ...(description ? { error_description: description } : {}) }
}

export function parseCloudDowntimeAccepted(v: unknown): CloudDowntimeAccepted | null {
  return record(v)?.accepted === true ? { accepted: true } : null
}
