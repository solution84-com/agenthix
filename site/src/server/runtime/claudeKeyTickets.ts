/**
 * How a `claude` process on an API key is given what it sends as its key: a
 * relay token for the site's model relay, which adds the real key to each
 * request (spec §1, §6), so no key enters the container.
 *
 * Claude Code runs its `apiKeyHelper` setting as a command of its own — not
 * through `CLAUDE_CODE_SHELL_PREFIX`, so outside the command sandbox, with the
 * CLI's environment — and uses the first line it prints as the key. The site
 * gives the process a ticket, in `SITE_HARNESS_KEY`, which the command
 * launcher removes from every agent command; the helper trades the ticket
 * here for the process's relay token.
 *
 * **A ticket is good once.** The CLI runs the helper when the process starts,
 * and again only after its cache lifetime, which the site sets beyond the
 * process's life, or after a 401. So the one exchange a process needs happens
 * before its first model request, before any tool the agent could call has
 * run; a ticket read from the process's environment afterwards — through
 * `/proc`, or by a program the harness itself runs — buys nothing. A 401
 * finds the ticket spent, and the turn fails; the runtime replaces a process
 * whose turn failed, and the replacement gets a new ticket.
 *
 * The relay token itself names a turn only while one runs (relayTokens.ts).
 *
 * In memory, like the platform tokens: a ticket dies with its process
 * (`revokeClaudeKeyTicket`), after its deadline if never used, and with a
 * site restart, which ends the processes anyway.
 */
import { randomBytes } from 'node:crypto'

/** Where the helper trades its ticket (mounted in app.ts). */
export const CLAUDE_KEY_PATH = '/api/v1/harness/claude-key'

/** How long an unused ticket lasts: a process asks for its key as it starts. */
export const CLAUDE_KEY_TICKET_TTL_MS = 5 * 60_000

const tickets = new Map<string, { relayToken: string; expiresAt: number }>()

export function issueClaudeKeyTicket(relayToken: string, now: number = Date.now()): string {
  const ticket = randomBytes(32).toString('base64url')
  tickets.set(ticket, { relayToken, expiresAt: now + CLAUDE_KEY_TICKET_TTL_MS })
  return ticket
}

/** The relay token, the first time only; null for a spent, expired or unknown ticket. */
export function redeemClaudeKeyTicket(ticket: string, now: number = Date.now()): string | null {
  const entry = tickets.get(ticket)
  if (!entry) return null
  tickets.delete(ticket)
  return now < entry.expiresAt ? entry.relayToken : null
}

export function revokeClaudeKeyTicket(ticket: string): void {
  tickets.delete(ticket)
}

/** Forgets tickets that were never used. Returns how many. */
export function sweepExpiredClaudeKeyTickets(now: number = Date.now()): number {
  let swept = 0
  for (const [ticket, entry] of tickets) {
    if (now >= entry.expiresAt) {
      tickets.delete(ticket)
      swept++
    }
  }
  return swept
}
