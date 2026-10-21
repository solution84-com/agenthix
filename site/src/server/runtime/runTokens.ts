/**
 * Opaque per-run MCP bearer (spec §H4). The container gets this token, never the
 * capability JWT: resolving it server-side to the run's live holder means renewal
 * (which mutates the holder in place — capabilityRenewal.ts) reaches every later
 * MCP request without touching the container, and the token is useless anywhere
 * but this process and dead the moment the run ends. In-memory by design: a run
 * does not survive a server restart, so neither should its bearer.
 *
 * Moved from hq/src/server/identity/runTokenRegistry.ts (plan 5d-2 task 7b) — this
 * file's own doc comment already called out "Moves to site with the runtime in
 * 5d." hq keeps its own copy for now (byte-untouched this task; its MCP handler
 * and git-credential API still resolve run tokens in-process) — site's copy is
 * unused until Task 8 wires site's own MCP handler to call issueRunToken/
 * resolveRunToken.
 */
import { randomBytes } from 'node:crypto'
import type { CapabilityHolder } from '../../agents/runtime/capabilityRenewal'
import { resolveConversationToken, sweepExpiredConversationTurns } from './conversationTokens'
import { sweepExpiredClaudeKeyTickets } from './claudeKeyTickets'

// Canonical definition lives in capabilityRenewal.ts; re-exported here for callers
// that only need the registry.
export type { CapabilityHolder }

type RunTokenEntry = { holder: CapabilityHolder; runId: string | null }

const registry = new Map<string, RunTokenEntry>()

/**
 * `holder` MUST be the same object instance passed to `startCapabilityRenewal`,
 * not a copy. The renewal loop mutates that instance's `jwt`/`expiresAt` in
 * place; a copy silently detaches the token from renewal, and the run loses
 * MCP access after the capability's ~12-minute renewal point with no error at
 * the call site — it only surfaces later as a 401 from the resolved (now
 * stale) holder.
 */
export function issueRunToken(holder: CapabilityHolder, runId: string | null = null): string {
  const token = randomBytes(32).toString('base64url')
  registry.set(token, { holder, runId })
  return token
}

/**
 * The live capability a platform token stands for: a run's own token, or a
 * conversation's token during one of its turns (conversationTokens.ts).
 * Everything that accepts a platform token — the MCP endpoint, the git
 * credential endpoint — resolves it here, so both kinds work everywhere.
 */
export function resolveRunToken(token: string): CapabilityHolder | null {
  return resolvePlatformToken(token)?.holder ?? null
}

/**
 * The live capability a platform token stands for, and the run it acts for
 * (null for a run token issued without one), so a platform tool the site
 * serves itself can find the turn's context (toolGateRuns.ts's `gateRunContext`).
 */
export function resolvePlatformToken(token: string): { holder: CapabilityHolder; runId: string | null } | null {
  const entry = registry.get(token)
  if (!entry) {
    const turn = resolveConversationToken(token)
    return turn ? { holder: turn.holder, runId: turn.runId } : null
  }
  if (Date.now() >= entry.holder.expiresAt) {
    registry.delete(token)
    return null
  }
  return entry
}

export function revokeRunToken(token: string): void {
  registry.delete(token)
}

/**
 * `resolveRunToken` already evicts an expired entry the moment it is next
 * read (lazy eviction) — this sweep only reclaims memory for a token whose
 * run crashed hard enough that nothing ever resolves it again (the container
 * died mid-run without the engine's own `finally` reaching `revokeRunToken`).
 * Plan 5d-2 task 8: called periodically from setup.ts, same hygiene posture
 * as the container idle sweep (ADR-0049) — mandatory-but-cheap, not load-bearing.
 */
export function sweepExpiredRunTokens(): number {
  const now = Date.now()
  let swept = sweepExpiredConversationTurns(now) + sweepExpiredClaudeKeyTickets(now)
  for (const [token, { holder }] of registry) {
    if (now >= holder.expiresAt) {
      registry.delete(token)
      swept++
    }
  }
  return swept
}
