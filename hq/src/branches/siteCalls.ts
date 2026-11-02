/**
 * hq's calls to a site for code work on branches (site protocol 1.12): one typed request for every `branch.*` and
 * `git.*` method, with the wait each family takes. Nothing here checks who is asking; every caller has applied the
 * workspace's access rule first (`workspaceAccess.ts`). A site that cannot be reached is a `SiteUnreachableError`, and
 * a site's coded refusal comes back as the `BranchWorkError` or `RepoWorkError` it is (`refusals.ts` says it in words).
 */
import {
  BRANCH_READ_METHODS, BRANCH_READ_TIMEOUT_MS, BRANCH_WORK_METHODS, BRANCH_WORK_TIMEOUT_MS, BranchWorkError,
  MAIN_WORK_METHODS, MAIN_WORK_TIMEOUT_MS, type SiteMethodName, type SiteMethodParams, type SiteMethodResult,
} from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { translateFailure } from '../storage/repoWorkStore'

export type BranchMethod =
  | (typeof BRANCH_WORK_METHODS)[keyof typeof BRANCH_WORK_METHODS]
  | (typeof BRANCH_READ_METHODS)[keyof typeof BRANCH_READ_METHODS]
  | (typeof MAIN_WORK_METHODS)[keyof typeof MAIN_WORK_METHODS]

const READS: ReadonlySet<string> = new Set(Object.values(BRANCH_READ_METHODS))
const MAIN: ReadonlySet<string> = new Set(Object.values(MAIN_WORK_METHODS))

export function timeoutOf(method: BranchMethod): number {
  if (READS.has(method)) return BRANCH_READ_TIMEOUT_MS
  if (MAIN.has(method)) return MAIN_WORK_TIMEOUT_MS
  return BRANCH_WORK_TIMEOUT_MS
}

/** `logicalSiteId`: the site's own id (`ExecutionSite.siteId`), as the channel addresses it. */
export async function siteCall<M extends BranchMethod & SiteMethodName>(
  logicalSiteId: string,
  method: M,
  params: SiteMethodParams<M>,
): Promise<SiteMethodResult<M>> {
  try {
    return await siteChannelRegistry.request(logicalSiteId, method, params, timeoutOf(method))
  } catch (err) {
    if (err instanceof Error) {
      const branch = BranchWorkError.fromWire(err.message)
      if (branch) throw branch
    }
    return translateFailure(logicalSiteId, method, err)
  }
}
