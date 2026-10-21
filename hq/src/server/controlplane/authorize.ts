import { roleAtLeast, minRoleForOrgEscapingTool, type OrgEscapingTool } from '../identity/rolePolicy'
import { projectStanding } from '../../projects/membership'
import { ControlPlaneError, type CallerContext, type ConnectionGrant } from './types'
import { actingPerson, confinedProjectId, reachesOwnSpace } from './runPerson'

/**
 * A run may do in hq only what both its boundary and the person it is for may
 * do (adr-0101): the boundary confines it (adr-0060), and each operation checks
 * that person as its browser twin checks the signed-in person — their current
 * organisation role for what is organisation-wide, and their role in the
 * project for the rest: a project Viewer reads and changes nothing (adr-0102). A
 * connection is its person, further limited to its own project list (adr-0090).
 * A conversation's turn is the person whose message it answers, confined to the
 * conversation's place as a run is to its boundary (adr-0082).
 * An agent's permissions never enter into it: Bypassed widens nothing here.
 *
 * **The browser operation and its control-plane twin move together.** A check
 * added to one side and missing from the other is a privilege escalation.
 */

/** Org-escaping tools (spec §H2): the person's role must clear the floor. They
 *  act on the whole organisation, so only a caller that is not confined to
 *  chosen projects may use them: a person's chat in their own storage, or a
 *  connection with no project list. A run in a project stays in its project. */
export async function requireRoleFloor(ctx: CallerContext, tool: OrgEscapingTool): Promise<void> {
  if (ctx.kind === 'connection' && ctx.connection.projectIds !== null) {
    throw new ControlPlaneError('forbidden', `${tool} acts on the whole organisation, beyond the projects this connection is limited to`)
  }
  if (ctx.kind !== 'connection' && !reachesOwnSpace(ctx)) {
    throw new ControlPlaneError('forbidden', `${tool} acts on the whole organisation, beyond the project this ${ctx.kind} is confined to`)
  }
  const { role } = await actingPerson(ctx, tool)
  const floor = minRoleForOrgEscapingTool(tool)
  if (!roleAtLeast(role, floor)) {
    throw new ControlPlaneError('forbidden', `${tool} requires the ${floor} role; caller role is ${role ?? 'none'}`)
  }
}

/** A connection limited to chosen projects reaches those and no other (adr-0090). */
export function requireWithinConnectionProjects(grant: ConnectionGrant, entityProjectId: string | null, what: string): void {
  if (grant.projectIds === null) return
  if (entityProjectId === null || !grant.projectIds.includes(entityProjectId)) {
    throw new ControlPlaneError('forbidden', `${what} is in a project this connection is not limited to`)
  }
}

/** The boundary's confinement alone (adr-0060): a run in a project reaches that
 *  project and no other, and a connection its own project list. A chat in its
 *  person's own storage is confined by its person's membership instead, which
 *  `requireProjectEntitlement` checks. Never enough on its own: every
 *  operation also checks the person, through `requireProjectEntitlement`. */
export function requireProjectScope(ctx: CallerContext, entityProjectId: string | null, what: string): void {
  if (ctx.kind === 'connection') {
    requireWithinConnectionProjects(ctx.connection, entityProjectId, what)
    return
  }
  if (reachesOwnSpace(ctx)) return
  if (entityProjectId === null || entityProjectId !== confinedProjectId(ctx)) {
    throw new ControlPlaneError('forbidden', `${what} is outside this ${ctx.kind}'s project scope`)
  }
}

/** What an operation does in a project: reads it, or works in it — any change. */
export type ProjectUse = 'read' | 'work'

/** The boundary's confinement, then the person: still in the organisation, a
 *  member of the entity's project (ADR-0062), and — for any change — one who
 *  works in it, not its Viewer (adr-0102). The intersection of the two, never
 *  a union. */
export async function requireProjectEntitlement(
  ctx: CallerContext,
  entityProjectId: string | null,
  what: string,
  use: ProjectUse,
): Promise<void> {
  requireProjectScope(ctx, entityProjectId, what)
  if (use === 'work' && ctx.kind === 'turn' && !ctx.turn.actingUserId) {
    throw new ControlPlaneError('forbidden', `${what} changes the project, and this turn acts for no one: it may only read`)
  }
  const person = await actingPerson(ctx, what)
  const standing = entityProjectId === null ? 'none' : await projectStanding(entityProjectId, person.userId)
  if (standing === 'none') {
    throw new ControlPlaneError('forbidden', `${what} requires membership of this project`)
  }
  if (use === 'work' && standing === 'reads') {
    throw new ControlPlaneError('forbidden', `${what} changes the project, and the person this acts for is its Viewer: a Viewer reads and changes nothing`)
  }
}

/** The acting agent is the capability's agent, for every run — chat included — and every turn.
 *  Acting as a different agent is identity falsification (SC-309). A connection
 *  is a person, not an agent: where an operation names an agent as its subject
 *  (whose queue to read), the connection must name it. */
export function actingAgentId(ctx: CallerContext, argAgentId?: string | null): string {
  if (ctx.kind === 'run') return ctx.claims.agentId
  if (ctx.kind === 'turn') return ctx.turn.agentId
  if (!argAgentId) throw new ControlPlaneError('invalid', 'agentId is required')
  return argAgentId
}
