/**
 * Agent Operations — GitHub Actions read queries (ADR-0037).
 * Target-keyed: each resolves its repo via the RepoAttachment (getRepoFor). Stateless
 * reads — GitHub is the source of truth. The repo-API paths are validated by the VPS
 * smoke test (plan Task 5), not mocked.
 *
 * Being signed in is not being entitled to the owner the target names, so each checks
 * the target against the caller's entitlement (`assertLocationAccess`, ADR-0060) before
 * resolving anything — the same rule the storage routes apply to the same owner shape.
 *
 * Typed as plain functions (no `wasp/server/operations` generics) to mirror the storage
 * ops — `RepoTarget` is an interface, which can't satisfy Wasp's `SuperJSONObject` payload
 * constraint; Wasp still wraps these from the main.wasp.ts declarations.
 */
import { HttpError } from 'wasp/server'
import { listWorkflows, listRuns } from './githubRuns'
import { listGitHubSecrets } from './githubSecrets'
import { assertLocationAccess } from '../storage/locationAccess'
import type { RepoTarget } from '../storage/repoAttachmentService'

type Ctx = { user?: { id: string } }

export const getWorkflows = async ({ target }: { target: RepoTarget }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'read')
  return listWorkflows(target, context.user.id)
}

export const getRuns = async ({ target }: { target: RepoTarget }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'read')
  return listRuns(target, context.user.id)
}

export const getRepoSecrets = async ({ target }: { target: RepoTarget }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'read')
  return listGitHubSecrets(target, context.user.id)
}
