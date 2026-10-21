/**
 * What started the run a tool call belongs to (adr-0087), read from its signed
 * capability. A value that cannot be read is never taken for a person: an
 * automated run must not gain what only a person-started run may do.
 */
import { parseRunStartedBy, type RunStartedBy } from '@agenthix/core'
import type { CallerContext } from './types'

export function startedByOf(ctx: CallerContext): RunStartedBy {
  // A person's connection is that person acting (adr-0090), so what it starts is person-started.
  if (ctx.kind === 'connection') return 'person'
  // A turn answering a person's message is that person's ask; one that answers no one was started by nobody.
  if (ctx.kind === 'turn') return ctx.turn.actingUserId ? 'person' : 'pulse'
  return parseRunStartedBy(ctx.claims.startedBy) ?? 'pulse'
}

