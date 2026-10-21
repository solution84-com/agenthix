/**
 * hq's own URL configuration utilities.
 * Pure environment helpers — no dependency on hq's other internals.
 *
 * Named "site" from before the 2026-08-11 rename, when this app was itself
 * called `site` and "HQ" named the old centrally-hosted service. Both
 * functions below return hq's own address, never an Execution Site's.
 */

/**
 * Returns hq's own public API/server URL.
 * Reads WASP_SERVER_URL in production; defaults to http://localhost:4101 in dev.
 */
export function getSitePublicUrl(): string {
  if (process.env.WASP_SERVER_URL) return process.env.WASP_SERVER_URL
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4101'
  return ''
}

/**
 * Returns hq's own frontend (SPA) URL.
 * Use this for links that navigate to client-side routes.
 * Reads WASP_WEB_CLIENT_URL in production; defaults to http://localhost:4100 in dev.
 */
export function getSiteClientUrl(): string {
  if (process.env.WASP_WEB_CLIENT_URL) return process.env.WASP_WEB_CLIENT_URL
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4100'
  return getSitePublicUrl()
}
