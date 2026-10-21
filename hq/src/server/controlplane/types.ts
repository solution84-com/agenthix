/**
 * Control-plane service layer (hq/site split spec §7.2, plan 5b-2).
 * Operations here are the single implementation behind the MCP tools and the
 * /api/v1/data endpoint. Authorization is enforced HERE, never in transport wiring.
 */
import type { CapabilityClaims } from '@agenthix/core'
import type { OrgRole } from '../identity/rolePolicy'
import type { ConnectionGroup } from '../../shared/connections'
import type { TurnCapability } from '../../conversations/contract'

/**
 * Who is calling: an agent's run, by its verified capability (the data path,
 * dataApi.ts); a person through one of their own connections (hq's /mcp,
 * adr-0090); or a conversation's turn, in process, with the capability minted
 * for it (adr-0082) — the person whose message it answers, in the
 * conversation's place. Nothing acts for no one: a turn that answers no person
 * only reads, as its conversation's reader.
 */
export type CallerContext = RunCaller | ConnectionCaller | TurnCaller

export interface RunCaller {
  kind: 'run'
  claims: CapabilityClaims
}

export interface ConnectionCaller {
  kind: 'connection'
  connection: ConnectionGrant
}

export interface TurnCaller {
  kind: 'turn'
  turn: TurnCapability
}

/**
 * A connection's authority: its person's, as read when the call arrived, and
 * never more. `role` is that person's org role; `groups` and `projectIds`
 * only narrow it. `projectIds` null means every project the person can reach.
 */
export interface ConnectionGrant {
  connectionId: string
  userId: string
  role: OrgRole
  groups: ReadonlySet<ConnectionGroup>
  projectIds: readonly string[] | null
}

/** The person behind a caller's acts, for the record: a run's capability user, a connection's person, or a turn's. */
export function callerUserId(ctx: CallerContext): string {
  if (ctx.kind === 'run') return ctx.claims.userId
  if (ctx.kind === 'connection') return ctx.connection.userId
  // Unreachable for a turn that answers no one: it is held to reading (turnCaller.ts).
  if (!ctx.turn.actingUserId) throw new ControlPlaneError('forbidden', 'This turn acts for no one, so it may only read')
  return ctx.turn.actingUserId
}

export type ControlPlaneErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'unavailable'

export class ControlPlaneError extends Error {
  constructor(public readonly code: ControlPlaneErrorCode, message: string) {
    super(message)
    this.name = 'ControlPlaneError'
  }
}
