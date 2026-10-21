/**
 * The person a caller acts for, as they are at this call (adr-0101). A run may
 * do in hq only what both its boundary and this person may do, so every check
 * that needs a person's authority starts here.
 *
 * A run's person is `personOfRun`'s answer (adr-0095). Their organisation role
 * and whether they are still in the organisation are read now, never taken
 * from the capability, so a changed role or a person who has left applies from
 * the run's next call. A connection is its person, with the role its
 * authentication read as the call arrived (connectionAuth.ts).
 */
import { prisma } from 'wasp/server'
import type { CapabilityClaims } from '@agenthix/core'
import type { OrgRole } from '../identity/rolePolicy'
import { ControlPlaneError, type CallerContext, type RunCaller, type TurnCaller } from './types'
import { personOfRun } from './runOnBehalfOf'

export interface ActingPerson {
  userId: string
  role: OrgRole | null
}

export async function actingPerson(ctx: CallerContext, what: string): Promise<ActingPerson> {
  if (ctx.kind === 'connection') return { userId: ctx.connection.userId, role: ctx.connection.role }
  // A turn is the person whose message it answers; one that answers no one reads as its conversation's reader,
  // and is held to reading (turnCaller.ts, requireProjectEntitlement).
  const userId = ctx.kind === 'turn' ? (ctx.turn.actingUserId ?? ctx.turn.readerUserId ?? null) : await personOfRun(ctx.claims)
  if (!userId) {
    throw new ControlPlaneError('forbidden', `${what} needs a person's authority, and this ${ctx.kind} is on behalf of no one`)
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { deactivatedAt: true, settings: { select: { role: true } } },
  })
  if (!row || row.deactivatedAt !== null) {
    throw new ControlPlaneError('forbidden', `${what}: the person this run is for is no longer in the organisation`)
  }
  return { userId, role: row.settings?.role ?? null }
}

/**
 * A run with no project and no task is a chat in its person's own storage: its
 * reach is its person's. Every other run is confined to its project (adr-0060).
 * Exact comparisons, so a token missing either field reaches nothing.
 */
export function isOwnStorageChat(claims: CapabilityClaims): boolean {
  return claims.projectId === null && claims.taskId === null
}

/**
 * Whether a run or a turn reaches every project its person can, rather than one: a chat in its person's own
 * storage, or a conversation in the person's own space. Each project it touches is still checked against the
 * person's membership (requireProjectEntitlement). A turn in a project or a task's thread is confined to that
 * project; anything else about a turn's place reads as confined, so it fails closed.
 */
export function reachesOwnSpace(ctx: RunCaller | TurnCaller): boolean {
  if (ctx.kind === 'run') return isOwnStorageChat(ctx.claims)
  const { home, projectId, taskId } = ctx.turn
  return home === 'PERSON' && projectId === null && taskId === null
}

/** The one project a confined run or turn reaches. Null — a token or place naming none — reaches nothing. */
export function confinedProjectId(ctx: RunCaller | TurnCaller): string | null {
  return ctx.kind === 'run' ? ctx.claims.projectId : ctx.turn.projectId
}
