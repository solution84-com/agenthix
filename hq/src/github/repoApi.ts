/**
 * Operations repo resolver (ADR-0037 §8 / ADR-0039): a storage target's repository and a token for it, through the
 * mint gate with only the permissions the operation needs. The token is ended once the operation is done.
 */
import type { GitHubPermissions } from '@agenthix/core'
import type { RepoTarget } from '../storage/repoAttachmentService'
import { resolveOwnerSiteId } from '../storage/ownerSite'
import { mintForLocation, revokeGateToken, type GateNeeds } from './mintGate'

export interface RepoApi {
  owner: string
  repo: string
  token: string
}

export type RepoApiAsk = { target: RepoTarget; userId: string; needs: GateNeeds; permissions: GitHubPermissions }

export async function withRepoApi<T>(ask: RepoApiAsk, use: (api: RepoApi) => Promise<T>): Promise<T> {
  const siteId = await resolveOwnerSiteId(ask.target.ownerType, ask.target.ownerId)
  if (!siteId) throw new Error('No Execution Site is available for this owner.')
  const t = await mintForLocation({
    place: { type: ask.target.ownerType, id: ask.target.ownerId },
    siteId,
    workspaceId: ask.target.workspaceId ?? null,
    person: ask.userId,
    needs: ask.needs,
    permissions: ask.permissions,
  })
  const [owner, repo] = t.repository.fullName.split('/')
  try {
    return await use({ owner, repo, token: t.token })
  } finally {
    await revokeGateToken(t.token).catch(() => false)
  }
}
