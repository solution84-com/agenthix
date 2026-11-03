/**
 * The workspace view's operations for code work on branches (spec parts 1–3). Every query checks read access to the
 * workspace (a project's Viewer included); every action checks the person is a Member or Admin, and a Viewer gets 403.
 * A site's refusal reaches the person in words (`refusals.ts`). The work itself is in the modules beside this one.
 */
import { HttpError } from 'wasp/server'
import type {
  BranchChangesView, BranchCommitsView, BranchRef, GitFileView, GitTreeView, MainVersionsView,
  MergeBranchInput, MergeBranchResult, RestoreVersionInput, RestoreVersionResult, WorkspaceBranchesView,
} from './views'
import { getBranchChanges, getBranchCommits, getGitFile, getGitTree, getMainVersions, getWorkspaceBranches } from './reads'
import { restoreVersion, turnGitOn } from './mainActions'
import { deleteBranch, renameBranch } from './branchActions'
import { startWorkspaceConversation } from './workspaceConversation'
import { openBranchById } from './branchRows'
import { reachWorkspace, requireUser } from './workspaceAccess'
import { mergeBranch, requireMergeInput } from './merge'
import { asBranchHttp } from './refusals'
import { getWorkspaceRemoval } from './workspaceRemoval'
import { bringBackBeforeMerge } from '../livePreviews/branchHooks'
// Registers the site's branch.back and the run status listener with the site channel, as the server starts.
import './branchBack'
// Registers the site's branch.packageBlocked: a card for a blocked package in a branch's copy.
import './packageCard'
import type { WorkspaceRemovalView } from './views'

type Ctx = { user?: { id: string } }

/** `main` and every open branch, for the branch select and Git's panel. */
export const getWorkspaceBranchesQuery = (a: { workspaceId: string }, c: Ctx): Promise<WorkspaceBranchesView> => getWorkspaceBranches(a, c)
/** A branch's changed files against its base. */
export const getBranchChangesQuery = (a: { workspaceId: string; branchId: string }, c: Ctx): Promise<BranchChangesView> => getBranchChanges(a, c)
/** A branch's commits since its base, newest first. */
export const getBranchCommitsQuery = (a: { workspaceId: string; branchId: string }, c: Ctx): Promise<BranchCommitsView> => getBranchCommits(a, c)
/** `main`'s versions, newest first; `before` is the oldest commit already shown. */
export const getMainVersionsQuery = (a: { workspaceId: string; before: string | null }, c: Ctx): Promise<MainVersionsView> => getMainVersions(a, c)
/** One folder of `main` or a branch, tracked files only. */
export const getGitTreeQuery = (a: { workspaceId: string; ref: BranchRef; path: string }, c: Ctx): Promise<GitTreeView> => getGitTree(a, c)
/** One file's text on `main`, on a branch, or at a branch's base (`at: 'base'`), for the file viewer and the diff. */
export const getGitFileQuery = (a: { workspaceId: string; ref: BranchRef; at: 'tip' | 'base'; path: string }, c: Ctx): Promise<GitFileView> => getGitFile(a, c)
/** What removing a workspace would stop and remove: its open branches (Default 5), for the confirmation. */
export const getWorkspaceRemovalQuery = (a: { workspaceId: string }, c: Ctx): Promise<WorkspaceRemovalView> => getWorkspaceRemoval(a, c)

export const turnGitOnAction = (a: { workspaceId: string }, c: Ctx): Promise<{ versionNumber: number; leftOut: string[] }> => turnGitOn(a, c)

export const mergeBranchAction = async (a: MergeBranchInput, c: Ctx): Promise<MergeBranchResult> => {
  const userId = requireUser(c)
  const branch = await openBranchById(null, a?.branchId)
  if (!branch) throw new HttpError(404, 'That branch is not open any more. Reload to see where it stands. Nothing was changed.')
  const ws = await reachWorkspace(branch.workspaceId, userId, 'work')
  const { message, expectedMain } = requireMergeInput(a.message, a.expectedMain)
  // Commits a live preview on another site holds come back first, so the merge takes everything committed.
  await bringBackBeforeMerge(branch.id)
  return asBranchHttp(() => mergeBranch({ branch, logicalSiteId: ws.logicalSiteId, personId: userId, message, expectedMain }))
}

export const restoreVersionAction = (a: RestoreVersionInput, c: Ctx): Promise<RestoreVersionResult> => restoreVersion(a, c)
export const renameBranchAction = (a: { branchId: string; name: string }, c: Ctx): Promise<{ name: string }> => renameBranch(a, c)
export const deleteBranchAction = (a: { branchId: string }, c: Ctx): Promise<{ lostCommits: number }> => deleteBranch(a, c)
/** A new conversation in this workspace, on a branch of its own made at its first run. */
export const startWorkspaceConversationAction = (a: { workspaceId: string }, c: Ctx): Promise<{ conversationId: string }> => startWorkspaceConversation(a, c)
