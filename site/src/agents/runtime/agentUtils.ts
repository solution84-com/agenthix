/**
 * Severed from hq/src/agents/runtime/agentUtils.ts (plan 5d-2 task 7b):
 * the agent row used to come from `db.Agent.findUnique` (hq's control-plane
 * Agent table, which site has no delegate for at all — SC-338). hq now
 * pre-resolves the agent's config at dispatch time (RunContextPayload.agent,
 * core/src/protocol/runtimeData.ts) — `resolveAgentContext` just carries it
 * through unchanged rather than re-fetching it. The session row is still a real
 * site-side read — AgentSession is one of the four runtime models site owns,
 * seeded by hq's `session.create` dispatch call before a run ever executes —
 * but that read moved up to AgentEngine.run, which needs it to place the run in
 * a queue; see `resolveAgentContext` below for why there is exactly one.
 */
import type { AgentSession } from '@prisma/client'
import type { AgentConfigPayload } from '@agenthix/core'

export type AgentContext = {
  agent: AgentConfigPayload
  session: AgentSession
}

/**
 * Pairs the run's agent config (from the dispatch context) with its session row,
 * and refuses the run when there is no session row.
 *
 * It no longer reads that row. The engine reads it ONCE, before the run is
 * placed in a queue, and threads it down: the container the run executes in is
 * derived from the session's storage location (containerPrep.ts), and a second
 * read after a queue wait that can run to minutes could disagree with the
 * first — silently, since nothing downstream compares them.
 * One read cannot disagree with itself, so the invariant is removed rather than
 * documented and hoped for.
 *
 * A null session still throws here rather than at the call site, so the run
 * fails through `processRun`'s own error path — a FAILED row and a terminal
 * frame — and it throws BEFORE the container is prepared, so a run whose session
 * could not be read never reaches a shared container at all.
 */
export async function resolveAgentContext(
  agent: AgentConfigPayload,
  args: { session: AgentSession | null },
): Promise<AgentContext> {
  if (!args.session) throw new Error('Session not found')

  return { agent, session: args.session }
}

/**
 * Strips NO_REPLY directives from the final reply.
 */
export function shapeAgentReply(text: string | null | undefined): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.includes('NO_REPLY')) return null
  return trimmed
}
