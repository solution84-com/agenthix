/**
 * The running-now view (person-scoped execution spec §3, ADR-0077, task
 * 2.19) — what is active in a project right now, visible to the project's
 * members: its agent, who or what started it, where it is working, since
 * when, and a flag when two runs share a workspace. Never a run's content.
 */
import { HttpError } from 'wasp/server'
import { requireProjectVisible } from '../projects/resourceEntitlement'
import { resolveActiveRuns, type ActiveRunView } from './activeRuns'
import { personalOwnerOf } from '../projects/personalProject'

type Ctx = { user?: { id: string } }

export const getProjectActiveRuns = async (
  { projectId }: { projectId: string },
  context: Ctx,
): Promise<ActiveRunView[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // A private project a caller is not a member of is not found at all (spec
  // §6.4) — same rule as the project overview itself (`getProject`).
  await requireProjectVisible(projectId, context.user.id)
  // A personal project's runs are in its person's own storage (spec §4), and
  // only its person gets past the check above.
  const person = await personalOwnerOf(projectId)
  return person ? resolveActiveRuns('user', person) : resolveActiveRuns('project', projectId)
}
