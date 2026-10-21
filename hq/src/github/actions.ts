/**
 * Agent Operations — GitHub Actions write actions (ADR-0037).
 * Target-keyed. setRepoSecret relays a value to GitHub Secrets (the platform persists
 * nothing); dispatchWorkflow triggers a workflow_dispatch run. Approval of *what runs*
 * is GitHub-native (PR review + branch protection), not a platform mechanism.
 *
 * Being signed in is not being entitled to the owner the target names, so each checks
 * the target against the caller's entitlement (`assertLocationAccess`, ADR-0060) before
 * touching GitHub — the same rule the storage routes apply to the same owner shape.
 *
 * Plain function signatures (no `wasp/server/operations` generics) to mirror the storage
 * ops — see queries.ts for why.
 */
import { HttpError } from 'wasp/server'
import { setRepoSecret as relayRepoSecret } from './githubSecrets'
import { dispatchWorkflow as runWorkflowDispatch } from './githubRuns'
import { assertLocationAccess } from '../storage/locationAccess'
import type { RepoTarget } from '../storage/repoAttachmentService'

type Ctx = { user?: { id: string } }

export const setRepoSecret = async (
  { target, name, value }: { target: RepoTarget; name: string; value: string },
  context: Ctx,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'work')
  if (!name.trim()) throw new HttpError(400, 'Secret name is required')
  await relayRepoSecret(target, name.trim(), value)
}

export const dispatchWorkflow = async (
  { target, workflowFile }: { target: RepoTarget; workflowFile: string },
  context: Ctx,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'work')
  if (!workflowFile.trim()) throw new HttpError(400, 'Workflow file is required')
  await runWorkflowDispatch(target, workflowFile.trim())
}
