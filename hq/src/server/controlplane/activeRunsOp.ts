/**
 * `list_active_runs` (person-scoped execution spec §3, ADR-0077, task 2.20) —
 * what is running now, scoped to the caller's OWN boundary. Scope is derived
 * entirely from the verified capability, never from an argument: a project
 * run sees Project X's runs because its capability's `projectId` names
 * Project X, and a personal run sees only its own because a chat capability's
 * `projectId` is null (spec §1a) — the same two facts `resolveGitCredentialOp`
 * and `startPreviewOp` already trust from the same claims, never from the
 * model. There is nothing for an argument to narrow, so the schema is empty
 * (toolSchemas.ts, forwardedToolSchemas.ts).
 *
 * A person's connection (adr-0090) sees what that person's own chat run would:
 * the runs in their own storage — unless it is limited to chosen projects,
 * which their own storage is not one of, and then it is refused.
 */
import { HttpError } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { resolveActiveRuns, type ActiveRunView } from '../../sessions/activeRuns'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { isSpaceProject } from '../../projects/personalProject'
import { requireProjectEntitlement } from './authorize'
import { actingPerson, confinedProjectId, reachesOwnSpace } from './runPerson'

export async function listActiveRunsOp(ctx: CallerContext, _args: unknown): Promise<{ runs: ActiveRunView[] }> {
  if (ctx.kind === 'connection' && ctx.connection.projectIds !== null) {
    throw new ControlPlaneError('forbidden', 'list_active_runs shows your own runs, which a connection limited to chosen projects cannot see')
  }
  let place: string | null
  let userId: string
  if (ctx.kind === 'connection') {
    place = null
    userId = ctx.connection.userId
  } else if (ctx.kind === 'run') {
    ;({ projectId: place, userId } = ctx.claims)
    // A run's person must still reach what it would list (adr-0101): its project,
    // or for a chat in their own storage, simply still be in the organisation.
    if (place !== null) await requireProjectEntitlement(ctx, place, 'list_active_runs', 'read')
    else await actingPerson(ctx, 'list_active_runs')
  } else {
    // A turn sees its place's runs, as its person: the project's, or in their own space their own.
    place = reachesOwnSpace(ctx) ? null : confinedProjectId(ctx)
    if (place === null && !reachesOwnSpace(ctx)) {
      throw new ControlPlaneError('forbidden', "list_active_runs is outside this turn's project scope")
    }
    if (place !== null) await requireProjectEntitlement(ctx, place, 'list_active_runs', 'read')
    userId = (await actingPerson(ctx, 'list_active_runs')).userId
  }
  const projectId = place
  try {
    // A task run in Your space names it but works in its person's own storage (spec §4) — that storage is its
    // boundary. Any other personal project has storage of its own.
    const actsForProject = projectId !== null && !(await isSpaceProject(projectId))
    const runs = actsForProject
      ? await resolveActiveRuns('project', projectId)
      : await resolveActiveRuns('user', userId)
    return { runs }
  } catch (err) {
    // Same explicit failure every other site read gives (spec §3's "cost") —
    // never an empty list standing in for "the site could not answer".
    if (err instanceof SiteUnreachableError) throw new ControlPlaneError('unavailable', err.message)
    if (err instanceof HttpError) throw new ControlPlaneError('invalid', err.message)
    throw err
  }
}
