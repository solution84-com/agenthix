/**
 * A live app's door at the relay (live preview spec section 4, *The app*; section 6, *Apps and the relay*): how a browser enters an app's address, the
 * cookies the relay sets there, and what it refuses. The relay answers every name under the preview domain
 * (previewAddress.ts), and carries each request and WebSocket it lets through to the site on its own `app.serve`
 * stream (core's appStream.ts).
 *
 * - **Entering.** hq's page sends a `POST` to `APP_ENTRY_PATH` on the app's address, a form whose `APP_ENTRY_FIELD`
 *   is the app ticket. The relay accepts it only with an `Origin` of hq, verifies the ticket (its own id the relay, the
 *   app's id the one the name carries, before `enterBy`), takes it once, sets the cookie the ticket's `cookie` names
 *   for no longer than the ticket lives, and redirects to `/`. A ticket is never taken from a link.
 * - **The cookies** are host-only: `__Host-`, `Secure`, `HttpOnly`, `Path=/`, no `Domain`. Their value is the relay's
 *   own random handle for the ticket it keeps; the ticket itself never reaches the browser again.
 * - **Cookies an app sets** pass through with any `Domain` attribute removed (`withoutCookieDomain`), so no app sets a
 *   cookie for another, nor for hq's domain.
 */

/** On every app's address; an app's own path of the same name is shadowed. */
export const APP_ENTRY_PATH = '/__relay/enter'
export const APP_ENTRY_FIELD = 'ticket'

export type AppCookie = { name: string; attributes: string }

/**
 * The two cookies, each living at most 15 minutes: inside the workspace view, partitioned under hq as the top-level site, so a page anywhere else that
 * frames or links the app does not get it; at the top level of a new tab, strict.
 */
export const APP_COOKIES: Record<'frame' | 'tab', AppCookie> = {
  frame: { name: '__Host-preview-frame', attributes: 'Secure; HttpOnly; Path=/; SameSite=None; Partitioned' },
  tab: { name: '__Host-preview-tab', attributes: 'Secure; HttpOnly; Path=/; SameSite=Strict' },
}

/** Ours, never passed to the app, and never set by it: the relay drops an app's `Set-Cookie` for either name. */
export function isRelayCookieName(name: string): boolean {
  return Object.values(APP_COOKIES).some(c => c.name.toLowerCase() === name.trim().toLowerCase())
}

/**
 * An app's `Set-Cookie` value with every `Domain` attribute removed, so the browser keeps it for the app's own
 * address only. Null for a cookie the relay drops: one named as the relay's own.
 */
export function withoutCookieDomain(setCookie: string): string | null {
  const parts = setCookie.split(';')
  const name = parts[0].split('=')[0] ?? ''
  if (isRelayCookieName(name)) return null
  return [parts[0], ...parts.slice(1).filter(p => p.split('=')[0].trim().toLowerCase() !== 'domain')].join(';')
}

/**
 * Why the relay refused a request to an app, counted per app for the guard's *relay refusals over a threshold*:
 * - `cross-site`: a page's part (script, data, image, `fetch`) whose `Sec-Fetch-Site` is not `same-origin`;
 * - `no-fetch-metadata`: no fetch metadata headers, which every browser that can run hq sends;
 * - `websocket-origin`: a WebSocket opened by a page that is not the app's own;
 * - `navigation`: a navigation that is not the entry, the app's own page, or one the person made at the top level;
 * - `entry-origin`: an entry `POST` not sent from hq's page;
 * - `framing`: framed by a page that is not hq's;
 * - `ticket`: an entry ticket refused, or used already;
 * - `no-cookie`: no cookie, or one the relay does not hold;
 * - `revoked`: hq cut the app, the live preview or the person off (`relay.revoke`, or `relay.answer` said no);
 * - `unknown-app`: a name under the preview domain that is no app's address.
 */
export const RELAY_APP_REFUSALS = [
  'cross-site', 'no-fetch-metadata', 'websocket-origin', 'navigation', 'entry-origin', 'framing', 'ticket', 'no-cookie',
  'revoked', 'unknown-app',
] as const
export type RelayAppRefusal = (typeof RELAY_APP_REFUSALS)[number]

/**
 * The most app streams one person may have open at a relay at once: a dev server's page loads hundreds of modules
 * at once, and each request is a stream. Counted apart from files' `RELAY_STREAMS_PER_PERSON`.
 */
export const RELAY_APP_STREAMS_PER_PERSON = 256
