import type { KeySet } from '../keySet'
import type { Load } from '../load'
import type { SiteLines } from '../lines/siteLines'
import type { AppJar } from './appJar'
import type { AppRefusals } from './appRefusals'

/** Whether the ticket behind a cookie still stands, asked of hq before every new stream (`relay.ask`). */
export type HqAsk = (q: { ticketId: string; person: string; appId: string; livePreviewId: string }) => Promise<boolean>

/**
 * How long hq's yes for a ticket stands for further streams without asking again: an app's own page may open streams
 * in a loop, and each ask reads hq's database. What hq cuts off reaches the relay at once (`relay.revoke`), and the
 * site checks the ticket and the live preview on every stream, so this delays nothing that is revoked.
 */
export const APP_ASK_REUSE_MS = 2_000

/** How long the site has to answer an app's request with its head: a dev server's first build can take a while. */
export const APP_HEAD_TIMEOUT_MS = 90_000

export type AppDoorDeps = {
  /** The live apps' address pattern; null: live apps are off and no preview address is answered. */
  pattern: string | null
  /** hq's origin: the only page an entry comes from, and the only one besides the app that may frame it. */
  hqOrigin: string | null
  lines: SiteLines
  /** Apps' streams, counted apart from files' (core's `RELAY_APP_STREAMS_PER_PERSON`). */
  load: Load
  jar: AppJar
  refusals: AppRefusals
  ask: HqAsk
  keys: KeySet
  relayId(): string | null
  now?: () => number
  headTimeoutMs?: number
  /** Bytes the site may send on a stream before the browser has taken them. */
  window?: number
  creditStep?: number
}
