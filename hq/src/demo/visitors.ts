/**
 * Visitors to the demo (live demo spec, *Getting in*). A visitor is an account *Enter the demo* made: its username
 * identity starts with `VISITOR_USERNAME_PREFIX`. Nothing else makes such a name in demo mode — invitations, the
 * first-admin link and sign-up are all refused — and a username never changes, so the mark cannot be taken off or put
 * on. Pure where it can be: the `where` fragments are for the queries that list people.
 */
import { demoOn } from './demoMode'

export const VISITOR_USERNAME_PREFIX = 'visitor-'

export function isVisitorUsername(username: string | null | undefined): username is string {
  return typeof username === 'string' && username.startsWith(VISITOR_USERNAME_PREFIX)
}

/**
 * The number a visitor is known by — *Visitor 4821*, `@visitor-4821` (walkthrough finding 10) — read from their
 * username, so their handle stays the same whatever they call themself. Null for anyone else.
 */
export function visitorNumber(username: string | null | undefined): number | null {
  if (!isVisitorUsername(username)) return null
  const hex = username.slice(VISITOR_USERNAME_PREFIX.length, VISITOR_USERNAME_PREFIX.length + 8)
  const n = Number.parseInt(hex, 16)
  return 1000 + (Number.isNaN(n) ? 0 : n % 9000)
}

/** A Prisma `where` on `User` matching every visitor account. */
export const VISITOR_USER = {
  auth: { identities: { some: { providerName: 'username', providerUserId: { startsWith: VISITOR_USERNAME_PREFIX } } } },
} as const

/**
 * The `where` on `User` that keeps visitors out of a list of people, but for the one looking (who sees themself as
 * You): in demo mode only; with the setting off, an empty fragment that changes nothing.
 */
export function hideOtherVisitors(viewerId: string | null | undefined): Record<string, unknown> {
  if (!demoOn()) return {}
  const notVisitor = { NOT: VISITOR_USER }
  return viewerId ? { OR: [{ id: viewerId }, notVisitor] } : notVisitor
}
