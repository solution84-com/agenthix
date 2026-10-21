/**
 * Operations repo resolver (ADR-0037 §8 / ADR-0039).
 * Resolves a storage target → owner/repo + a short-lived App token via getTokenFor.
 */
import { getRepoFor, type RepoTarget } from '../storage/repoAttachmentService'
import { resolveOwnerSiteId } from '../storage/ownerSite'
import { parseRepo } from '../storage/github'
import { canonicalGitHubRepoUrl } from '../storage/canonicalRepoUrl'
import { getTokenFor } from './githubApp'

export interface RepoApi {
  owner: string
  repo: string
  token: string
}

export async function resolveRepoApi(target: RepoTarget): Promise<RepoApi> {
  const siteId = await resolveOwnerSiteId(target.ownerType, target.ownerId)
  if (!siteId) throw new Error('No Execution Site is available for this owner.')
  const r = await getRepoFor(siteId, target)
  if (!r) throw new Error('No GitHub repo is connected to this location.')
  // A row linked before the canonical form was enforced may still hold http://, www. or .git.
  const { owner, name } = parseRepo(canonicalGitHubRepoUrl(r.repoUrl) ?? r.repoUrl)
  const token = await getTokenFor({ owner, name })
  return { owner, repo: name, token }
}
