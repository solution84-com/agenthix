/**
 * The app tickets the relay holds behind browsers' cookies (live preview spec section 6, *Apps and the relay*), in memory only: a restart
 * forgets them all, and the browser enters again through hq. A cookie carries only a random handle; the ticket never
 * reaches the browser again. Each ticket is entered once. What hq cuts off (`relay.revoke`) is forgotten at once, its
 * open streams ended, and a ticket it covers, signed up to that second, is refused at entry for as long as any ticket lives.
 *
 * A handle the jar forgot (run out, cut off, replaced) is remembered by its app for as long as a ticket lives, so a
 * request that carries it is known for a page that held a real entry (`knows`), unlike one with no cookie or a made-up
 * one, which anyone on the internet can send.
 */
import { randomBytes } from 'node:crypto'
import {
  APP_COOKIES, APP_TICKET_TTL_SECONDS, type AppCookieKind, type AppTicketClaims, type RelayRevoke,
} from '@agenthix/core'

export type Entered = {
  handle: string
  /** The ticket as hq signed it, presented to the site on every stream. Never logged. */
  ticket: string
  claims: AppTicketClaims
  cookie: AppCookieKind
  expiresAtMs: number
  /** Until when hq's last yes for this ticket is taken again without asking (`APP_ASK_REUSE_MS`). */
  askedUntilMs?: number
}

/** Far more than any fleet's open apps; past it the oldest entry is forgotten (its browser enters again). */
export const MAX_ENTERED = 20_000

const REMEMBER_MS = APP_TICKET_TTL_SECONDS * 1000

type Cut = { atSeconds: number; until: number }

/** A ticket signed at or before the cut's second is cut off: a ticket signed in that same second is refused too. */
const cutFor = (cut: Cut | undefined, iat: number) => cut !== undefined && iat <= cut.atSeconds

export class AppJar {
  private readonly entries = new Map<string, Entered>()
  private readonly used = new Map<string, number>()
  /** A person cut off: every ticket of theirs signed at or before this second (its `iat`) is void. */
  private readonly personCutAt = new Map<string, { atSeconds: number; until: number }>()
  // An app or a live preview is cut off for the tickets signed up to that second: one that started again, or resumed,
  // is entered with a ticket hq signs after.
  private readonly cut = { apps: new Map<string, Cut>(), livePreviews: new Map<string, Cut>(), tickets: new Map<string, number>() }
  private readonly streams = new Map<string, Set<() => void>>()
  private readonly forgotten = new Map<string, { appId: string; until: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  /** Takes a verified ticket once: the handle for its cookie, or why not. */
  enter(ticket: string, claims: AppTicketClaims): { entered: Entered } | { refused: 'ticket' | 'revoked' } {
    const now = this.now()
    this.sweep(now)
    if (this.used.has(claims.jti)) return { refused: 'ticket' }
    this.used.set(claims.jti, claims.exp * 1000)
    if (this.isCut(claims)) return { refused: 'revoked' }
    while (this.entries.size >= MAX_ENTERED) this.forget(this.entries.keys().next().value as string)
    const entered: Entered = {
      handle: randomBytes(32).toString('base64url'), ticket, claims, cookie: claims.cookie, expiresAtMs: claims.exp * 1000,
    }
    this.entries.set(entered.handle, entered)
    return { entered }
  }

  /** The entry behind the request's cookie for this app, or null: no cookie, an unknown handle, run out, or cut off. */
  find(cookieHeader: string | undefined, appId: string): Entered | null {
    const now = this.now()
    for (const kind of ['frame', 'tab'] as const) {
      const handle = cookieValue(cookieHeader, APP_COOKIES[kind].name)
      const entry = handle ? this.entries.get(handle) : undefined
      if (!entry || entry.cookie !== kind || entry.claims.appId !== appId) continue
      if (entry.expiresAtMs <= now || this.isCut(entry.claims)) {
        this.forget(entry.handle)
        continue
      }
      return entry
    }
    return null
  }

  /** Ends `kill` when the entry is forgotten (cut off, run out, replaced); the returned function stops watching. */
  track(entry: Entered, kill: () => void): () => void {
    let set = this.streams.get(entry.handle)
    if (!set) this.streams.set(entry.handle, (set = new Set()))
    set.add(kill)
    const timer = setTimeout(() => this.forget(entry.handle), Math.max(0, entry.expiresAtMs - this.now()))
    timer.unref?.()
    return () => {
      clearTimeout(timer)
      this.streams.get(entry.handle)?.delete(kill)
    }
  }

  /** True when the request carries a cookie for this app that the jar holds, or held within a ticket's life. */
  knows(cookieHeader: string | undefined, appId: string): boolean {
    const now = this.now()
    return (['frame', 'tab'] as const).some(kind => {
      const handle = cookieValue(cookieHeader, APP_COOKIES[kind].name)
      if (!handle) return false
      const entry = this.entries.get(handle)
      if (entry) return entry.claims.appId === appId
      const gone = this.forgotten.get(handle)
      return gone !== undefined && gone.appId === appId && gone.until > now
    })
  }

  forget(handle: string): void {
    const entry = this.entries.get(handle)
    if (entry) {
      while (this.forgotten.size >= MAX_ENTERED) this.forgotten.delete(this.forgotten.keys().next().value as string)
      this.forgotten.set(handle, { appId: entry.claims.appId, until: this.now() + REMEMBER_MS })
    }
    this.entries.delete(handle)
    const kills = this.streams.get(handle)
    this.streams.delete(handle)
    for (const kill of kills ?? []) kill()
  }

  revoke(frame: Pick<RelayRevoke, 'person' | 'apps' | 'livePreviews' | 'tickets'>): void {
    const now = this.now()
    const until = now + REMEMBER_MS
    if (frame.person !== undefined) this.personCutAt.set(frame.person, { atSeconds: Math.floor(now / 1000), until })
    const atSeconds = Math.floor(now / 1000)
    for (const id of frame.apps ?? []) this.cut.apps.set(id, { atSeconds, until })
    for (const id of frame.livePreviews ?? []) this.cut.livePreviews.set(id, { atSeconds, until })
    for (const id of frame.tickets ?? []) this.cut.tickets.set(id, until)
    for (const entry of [...this.entries.values()]) if (this.isCut(entry.claims)) this.forget(entry.handle)
  }

  get size(): number {
    return this.entries.size
  }

  private isCut(c: AppTicketClaims): boolean {
    const personCut = this.personCutAt.get(c.person)
    return (personCut !== undefined && c.iat <= personCut.atSeconds)
      || cutFor(this.cut.apps.get(c.appId), c.iat) || cutFor(this.cut.livePreviews.get(c.livePreviewId), c.iat)
      || this.cut.tickets.has(c.jti)
  }

  private sweep(now: number): void {
    for (const [id, until] of this.used) if (until <= now) this.used.delete(id)
    for (const [handle, f] of this.forgotten) if (f.until <= now) this.forgotten.delete(handle)
    for (const map of [this.cut.apps, this.cut.livePreviews]) for (const [id, cut] of map) if (cut.until <= now) map.delete(id)
    for (const [id, until] of this.cut.tickets) if (until <= now) this.cut.tickets.delete(id)
    for (const [person, cut] of this.personCutAt) if (cut.until <= now) this.personCutAt.delete(person)
    for (const entry of [...this.entries.values()]) if (entry.expiresAtMs <= now) this.forget(entry.handle)
  }
}

/** One cookie's value from a `Cookie` header, by exact name. */
export function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null
  }
  return null
}

/** The `Cookie` header the app receives: every cookie but the relay's own. Undefined when none is left. */
export function cookiesForApp(header: string | undefined, isRelays: (name: string) => boolean): string | undefined {
  if (!header) return undefined
  const kept = header.split(';').map(p => p.trim()).filter(p => p && !isRelays(p.split('=')[0]))
  return kept.length ? kept.join('; ') : undefined
}
