/**
 * Opening a live app (live preview spec section 4, *The app*; adr-0169): in the workspace view, in a new tab, or
 * renewing either's cookie. hq decides first: the person may see the live preview (the caller's check, `livePreview`),
 * it is running, live previews have an address on this install, and its site's relay is connected. Then hq asks the
 * site for its own single-use ticket for that app and entry (`livePreview.act`, `app.open`), signs an app ticket
 * carrying it, and hands back what the browser's form posts to the app's address. The ticket is never put in a link.
 */
import { HttpError } from 'wasp/server'
import {
  APP_ENTRIES, APP_ENTRY_FIELD, APP_ENTRY_PATH, isAppId, type AppCookieKind, type AppEntry, type AppTicketInput,
  type LivePreviewActParams, type LivePreviewActResult,
} from '@agenthix/core'
import type { SignedAppTicket } from './relayTokens'
import { NO_PREVIEW_ADDRESS_MESSAGE } from './appAddress'

/** What the browser posts, as a form, to `action`, into the workspace view's frame or a new tab (`target`). */
export type AppEntryForm = {
  action: string
  field: string
  ticket: string
  origin: string
  target: AppCookieKind
  /** Milliseconds since the epoch: when the cookie it gives runs out, so the page renews before. */
  expiresAt: number
}

export type OpenLiveAppArgs = {
  livePreviewId: string
  appId: string
  entry: AppEntry
  /** For a renewal: which cookie it renews. */
  cookie?: AppCookieKind
}

/** The live preview as hq holds it, once the caller has checked the person may see it. */
export type EntryLivePreview = { id: string; state: string; workspaceId: string; executionSiteId: string }

export type AppEntryDeps = {
  /** The live preview, after hq's own access check for the person; throws hq's words when they may not see it. */
  livePreview(userId: string, livePreviewId: string): Promise<EntryLivePreview>
  /** Whether the app last ran in this live preview, as hq recorded it. */
  appInLivePreview(appId: string, livePreviewId: string): Promise<boolean>
  appAddress(appId: string): string | null
  /** The live preview's site and its relay, with whether the relay is connected now; null for a site hq does not hold. */
  siteAndRelay(executionSiteId: string): Promise<{ siteId: string; label: string; relayId: string | null; relayConnected: boolean } | null>
  /** The site's answer to `livePreview.act`; throws when the site does not answer. */
  askSite(siteId: string, params: LivePreviewActParams): Promise<LivePreviewActResult>
  issue(input: Omit<AppTicketInput, 'enterBy'>): Promise<SignedAppTicket>
}

const NOTHING = 'Nothing was changed.'

export async function openLiveApp(userId: string, a: OpenLiveAppArgs, deps: AppEntryDeps): Promise<AppEntryForm> {
  if (!a || typeof a.livePreviewId !== 'string' || !isAppId(a.appId) || !(APP_ENTRIES as readonly string[]).includes(a.entry)) {
    throw new HttpError(400, `This is not one of the live preview's apps. ${NOTHING}`)
  }
  const cookie: AppCookieKind | undefined = a.entry === 'renew' ? a.cookie : a.entry
  if (cookie !== 'frame' && cookie !== 'tab') throw new HttpError(400, `A renewal says which way the app is open. ${NOTHING}`)
  const lp = await deps.livePreview(userId, a.livePreviewId)
  if (lp.state === 'PAUSED') throw new HttpError(409, `This live preview is paused. Resume it, then open the app. ${NOTHING}`)
  if (lp.state !== 'RUNNING') throw new HttpError(409, `This live preview isn't running. Start it from the workspace, then open the app. ${NOTHING}`)
  if (!(await deps.appInLivePreview(a.appId, lp.id))) throw new HttpError(404, `This is not one of the live preview's apps. ${NOTHING}`)

  const origin = deps.appAddress(a.appId)
  if (!origin) throw new HttpError(409, NO_PREVIEW_ADDRESS_MESSAGE)
  const held = await deps.siteAndRelay(lp.executionSiteId)
  if (!held) throw new HttpError(404, `The site this live preview runs on is not connected to this HQ. ${NOTHING}`)
  if (!held.relayId || !held.relayConnected) {
    throw new HttpError(503, `The relay that carries ${held.label}'s apps isn't connected. Try again in a minute. ${NOTHING}`)
  }

  let answer: LivePreviewActResult
  try {
    answer = await deps.askSite(held.siteId, { livePreviewId: lp.id, personId: userId, request: { kind: 'app.open', appId: a.appId, entry: a.entry } })
  } catch {
    throw new HttpError(503, `${held.label} did not answer. Try again in a moment. ${NOTHING}`)
  }
  if (!answer.ok) {
    if (answer.refusal.code === 'appNotRunning') {
      throw new HttpError(409, `This app is not running on ${held.label}. Ask the agent to start it, then open it again. ${NOTHING}`)
    }
    // The site's own sentence, which already says what to do.
    throw new HttpError(409, answer.refusal.message)
  }
  if (answer.outcome.kind !== 'app.open' || typeof answer.outcome.ticket?.ticket !== 'string' || !answer.outcome.ticket.ticket) {
    throw new HttpError(502, `${held.label} gave an answer HQ could not read. ${NOTHING}`)
  }
  const ticket = await deps.issue({
    site: held.siteId, relay: held.relayId, person: userId, livePreviewId: lp.id, workspaceId: lp.workspaceId,
    appId: a.appId, entry: a.entry, cookie, siteTicket: answer.outcome.ticket.ticket,
  })
  return { action: `${origin}${APP_ENTRY_PATH}`, field: APP_ENTRY_FIELD, ticket: ticket.token, origin, target: cookie, expiresAt: ticket.expiresAt }
}
