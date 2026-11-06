/**
 * The params of every branch method (site protocol 1.12, and 1.13's `git.versionChanges`), checked on arrival with core's own predicates
 * (`gitNames.ts`), so a name, path, commit or person hq would refuse is refused here too before any Git runs. Each
 * schema is pinned to core's type with `Exact`, so a field core adds fails the typecheck rather than being dropped.
 */
import { z } from 'zod'
import {
  BRANCH_COMMITS_MAX, WORKSPACE_OWNER_TYPES,
  isCommitId, isCommitMessage, isCopyId, isGitBranchName, isGitEmail, isGitPersonName, isRepoPath, isWorkBranchName,
  type BranchBringBackParams, type BranchChangesParams, type BranchCommitParams, type BranchCommitsParams,
  type BranchCopyParams, type BranchCreateParams, type BranchDeleteParams, type BranchListParams,
  type BranchRemoveCopyParams, type BranchRenameParams, type BranchUpdateFromMainParams, type Exact, type GitInitParams, type GitListTreeParams,
  type GitMergeParams, type GitPullMainParams, type GitPushMainParams, type GitReadFileParams, type GitRestoreParams,
  type GitVersionChangesParams, type GitVersionsParams, type WorkspaceRepoRef,
} from '@agenthix/core'

const by = <T>(check: (v: unknown) => v is T) => z.string().refine(check)

export const workspaceRef = z.object({
  ownerType: z.enum(WORKSPACE_OWNER_TYPES),
  ownerId: z.string().min(1).max(200),
  workspaceId: z.string().min(1).max(200),
})
const branch = by(isGitBranchName)
const workBranch = by(isWorkBranchName)
const commitId = by(isCommitId)
const copyId = by(isCopyId)
export const gitPerson = z.object({ name: by(isGitPersonName), email: by(isGitEmail) })
const person = gitPerson
const message = by(isCommitMessage)
const mergeBase = z.object({ mergedCommit: commitId, mergedVersion: commitId })
const rev = z.union([z.object({ commit: commitId }), z.object({ branch })])
const copyRef = { workspace: workspaceRef, copyId, branch }

export const createParams = z.object({ workspace: workspaceRef, copyId, branch: workBranch })
export const copyParams = z.object(copyRef)
export const commitParams = z.object({ ...copyRef, message, author: person, onBehalfOf: person.nullable(), runId: z.string().min(1) })
export const bringBackParams = z.object(copyRef)
export const updateFromMainParams = z.object({ ...copyRef, author: person, onBehalfOf: person.nullable(), runId: z.string().min(1) })
export const renameParams = z.object({ workspace: workspaceRef, from: branch, to: workBranch, copyId: copyId.nullable() })
export const deleteParams = z.object({ workspace: workspaceRef, branch, copyId: copyId.nullable() })
export const removeCopyParams = z.object({ workspace: workspaceRef, copyId })

export const listParams = z.object({ workspace: workspaceRef, merged: z.array(z.object({ branch, base: mergeBase })).max(2000) })
export const changesParams = z.object({ workspace: workspaceRef, branch, base: mergeBase.nullable() })
export const commitsParams = changesParams.extend({ limit: z.number().int().min(1).max(BRANCH_COMMITS_MAX) })
export const readFileParams = z.object({ workspace: workspaceRef, rev, path: by(isRepoPath) })
export const listTreeParams = z.object({ workspace: workspaceRef, rev, path: z.union([z.literal(''), by(isRepoPath)]) })
export const versionsParams = z.object({ workspace: workspaceRef, limit: z.number().int().min(1), before: commitId.nullable() })
export const versionChangesParams = z.object({ workspace: workspaceRef, version: commitId })

export const initParams = z.object({ workspace: workspaceRef, author: person })
export const mergeParams = z.object({ workspace: workspaceRef, branch, base: mergeBase.nullable(), expectedMain: commitId, message, author: person })
export const restoreParams = z.object({ workspace: workspaceRef, version: commitId, expectedMain: commitId, message, author: person })
export const pushMainParams = z.object({ workspace: workspaceRef, token: z.string().min(1) })
export const pullMainParams = pushMainParams

const _mirrorsCore: [
  Exact<z.infer<typeof workspaceRef>, WorkspaceRepoRef>,
  Exact<z.infer<typeof createParams>, BranchCreateParams>,
  Exact<z.infer<typeof copyParams>, BranchCopyParams>,
  Exact<z.infer<typeof commitParams>, BranchCommitParams>,
  Exact<z.infer<typeof bringBackParams>, BranchBringBackParams>,
  Exact<z.infer<typeof updateFromMainParams>, BranchUpdateFromMainParams>,
  Exact<z.infer<typeof renameParams>, BranchRenameParams>,
  Exact<z.infer<typeof deleteParams>, BranchDeleteParams>,
  Exact<z.infer<typeof removeCopyParams>, BranchRemoveCopyParams>,
  Exact<z.infer<typeof listParams>, BranchListParams>,
  Exact<z.infer<typeof changesParams>, BranchChangesParams>,
  Exact<z.infer<typeof commitsParams>, BranchCommitsParams>,
  Exact<z.infer<typeof readFileParams>, GitReadFileParams>,
  Exact<z.infer<typeof listTreeParams>, GitListTreeParams>,
  Exact<z.infer<typeof versionsParams>, GitVersionsParams>,
  Exact<z.infer<typeof versionChangesParams>, GitVersionChangesParams>,
  Exact<z.infer<typeof initParams>, GitInitParams>,
  Exact<z.infer<typeof mergeParams>, GitMergeParams>,
  Exact<z.infer<typeof restoreParams>, GitRestoreParams>,
  Exact<z.infer<typeof pushMainParams>, GitPushMainParams>,
  Exact<z.infer<typeof pullMainParams>, GitPullMainParams>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]
void _mirrorsCore
