/**
 * `git.status` (site protocol 1.8): a workspace's, or an owner's `files/`, git status at a glance. The folder is
 * confined as any location is (`resolveInLocation`: symbolic links resolved, and the layout's own folders not
 * replaced by links), and the git is `../../storage/gitStatusRead.ts`, which says why nothing in the repository runs.
 *
 * A folder not made yet is not a repository. Refusals are the repository-work vocabulary, through
 * `./repoWorkRefusals.ts`, so none names a path on this disk.
 */
import { z } from 'zod'
import {
  GIT_STATUS_METHOD,
  GIT_STATUS_SITE_BUDGET_MS,
  LocationFileError,
  RepoWorkError,
  WORKSPACE_OWNER_TYPES,
  type Exact,
  type GitStatusParams,
  type GitStatusResult,
} from '@agenthix/core'
import { GitDeadline } from '../../storage/gitRunner'
import { readGitStatus } from '../../storage/gitStatusRead'
import { resolveInLocation } from './locationContainment'
import { detailFor, parseParams, refuse, UNPARSED_LOCATION } from './repoWorkRefusals'

const gitStatusParams = z.object({
  loc: z.object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    workspaceId: z.string().nullish(),
    taskId: z.string().nullish(),
  }),
})

const _wireMirrorsCore: Exact<z.infer<typeof gitStatusParams>, GitStatusParams> = true
void _wireMirrorsCore

export async function gitStatus(params: unknown): Promise<GitStatusResult> {
  const method = GIT_STATUS_METHOD
  const { loc } = parseParams(gitStatusParams, params, method, UNPARSED_LOCATION)
  let dir: string
  try {
    dir = await resolveInLocation(loc, method, '')
  } catch (err) {
    if (err instanceof LocationFileError && err.code === 'not_found') return { repository: false }
    if (err instanceof LocationFileError && err.code === 'refused') throw new RepoWorkError('refused', detailFor('refused', method, loc))
    throw new RepoWorkError('outside', detailFor('outside', method, loc))
  }
  try {
    return await readGitStatus(dir, new GitDeadline(GIT_STATUS_SITE_BUDGET_MS))
  } catch (err) {
    refuse(err, method, loc, '', null)
  }
}
