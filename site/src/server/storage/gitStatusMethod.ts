/**
 * `git.status` (site protocol 1.8): a workspace's, or an owner's `files/`, git status at a glance. A repository
 * workspace's is read from its `main` in the code space (adr-0173). Any other folder is confined as any location is
 * (`resolveInLocation`: symbolic links resolved, and the layout's own folders not replaced by links), and the git is
 * `../../storage/gitStatusRead.ts`, which says why nothing in the repository runs. The read writes nothing into the
 * folder: git runs over a git directory of the site's own in the system's temporary folder, with optional locks off,
 * so it never refreshes the index; a backed-up `files/` is only ever read here.
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
import { isCodeWorkspace } from './codeSpace'
import { resolveInLocation } from './locationContainment'
import { getCodeDir } from './paths'
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
  if (loc.workspaceId && !loc.taskId) {
    const ws = { ownerType: loc.ownerType, ownerId: loc.ownerId, workspaceId: loc.workspaceId }
    let code = false
    try {
      code = await isCodeWorkspace(ws)
    } catch {
      throw new RepoWorkError('outside', detailFor('outside', method, loc))
    }
    if (code) {
      try {
        return await readGitStatus(getCodeDir(ws), new GitDeadline(GIT_STATUS_SITE_BUDGET_MS))
      } catch (err) {
        refuse(err, method, loc, '', null)
      }
    }
  }
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
