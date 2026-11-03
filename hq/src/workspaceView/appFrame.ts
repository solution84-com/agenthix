/**
 * How the workspace view holds a live app (live preview spec section 4, *The app*; section 6): the frame's sandbox,
 * and entering the app by a form `POST` from HQ's page, never a ticket in a link. Client code: no server imports.
 *
 * The frame may run the app's scripts at the app's own origin (a separate origin from HQ, its cookie partitioned
 * under HQ) and submit its forms, but never navigate HQ's page, open pop-ups, or use a permission: there is no
 * `allow-top-navigation*`, no `allow-popups*`, and no `allow` attribute. HQ never acts on a message a frame sends.
 */
import type { LiveAppEntryForm } from '../livePreviews/types'

export const APP_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-downloads'
export const APP_FRAME_REFERRER_POLICY = 'no-referrer'

/** Renew a frame's cookie this long before it runs out. */
export const APP_RENEW_BEFORE_MS = 2 * 60 * 1000
const RENEW_SOONEST_MS = 10_000

/** When to renew a cookie that runs out at `expiresAt`. */
export const renewIn = (expiresAt: number, now = Date.now()): number => Math.max(RENEW_SOONEST_MS, expiresAt - now - APP_RENEW_BEFORE_MS)

/**
 * Posts the entry form: into the frame (or hidden frame) named `target`, or a new tab with no way back to HQ's page.
 * The ticket lives only in the form, which is removed once sent. Only an `https:` or `http:` action is posted to.
 */
export function postAppEntry(entry: LiveAppEntryForm, target: string, doc: Document = document): void {
  let action: URL
  try { action = new URL(entry.action) } catch { return }
  if (action.protocol !== 'https:' && action.protocol !== 'http:') return
  const form = doc.createElement('form')
  form.method = 'POST'
  form.action = action.toString()
  form.enctype = 'application/x-www-form-urlencoded'
  form.target = entry.target === 'tab' ? '_blank' : target
  // No way back to HQ's page; not `noreferrer`, which sends the Origin as `null`, and the relay takes an entry only
  // from HQ's Origin.
  form.rel = 'noopener'
  form.style.display = 'none'
  const field = doc.createElement('input')
  field.type = 'hidden'
  field.name = entry.field
  field.value = entry.ticket
  form.appendChild(field)
  doc.body.appendChild(form)
  try {
    form.submit()
  } finally {
    form.remove()
  }
}
