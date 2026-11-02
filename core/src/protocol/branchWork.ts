/**
 * Code work on branches (site protocol 1.12, live preview spec parts 2 and 3): what hq asks a site to do with a code
 * workspace's repository and its branches' working copies, on the control channel. This file holds the shared shapes
 * and the methods that make, commit in, bring back, rename and remove; `branchReads.ts` holds the reads and
 * `mainWork.ts` turning Git on, merging, restoring and GitHub.
 *
 * - A **code workspace** is a workspace whose folder is a Git repository. Its folder stays on `main`: the branch the
 *   folder has checked out, whatever it is called. The site reads that name from the folder; no method names it.
 * - A **copy** is one branch's working copy: a `git clone --local` of the workspace's repository in
 *   `clones/<copyId>/` of the owner's storage, checked out on that branch. hq mints `copyId` (a uuid) and keeps it
 *   (`BranchCopy`); the site keeps its own record of each copy's workspace and branch, and checks every call against
 *   it, because a copy's `.git` is written by an agent and says nothing the site may trust.
 * - **Every Git command on a copy runs in the commit helper**, with hooks off and the copy's own settings not read.
 *   Bringing a branch back reads the copy's commits and writes only that branch's name in the workspace's repository.
 * - **No method moves `main`** but `git.merge`, `git.restore`, `git.init` and `git.pullMain`. A call naming the
 *   workspace's `main` where a branch is meant is refused (`is_main`).
 *
 * Every name, path, commit and person is checked against `gitNames.ts` on both ends. Refusals are `RepoWorkError`s or
 * `BranchWorkError`s (`branchErrors.ts` says which is which), and name no path on the site's disk.
 */
import type { StorageOwnerType } from '../storage/locationRef.js'

export const BRANCH_WORK_METHODS = {
  /** Make a new branch at `main`'s tip, and its copy. */
  create: 'branch.create',
  /** Make a copy of a branch that already exists, as when its work opens again after its copy was removed. */
  copy: 'branch.copy',
  /** Commit everything changed in a copy, for the agent's `commit` tool, and bring the branch back at once. */
  commit: 'branch.commit',
  /** Bring a copy's commits back to the workspace's repository, as the site's own sweep does. */
  bringBack: 'branch.bringBack',
  /** Merge `main` into a copy's branch, for the agent's `update_from_main` tool; a clean merge comes back at once. */
  updateFromMain: 'branch.updateFromMain',
  rename: 'branch.rename',
  /** Delete a branch from the workspace's repository, and its copy when it has one. */
  delete: 'branch.delete',
  /** Remove a copy; the branch stays in the workspace's repository. */
  removeCopy: 'branch.removeCopy',
} as const

/**
 * How long hq waits for a branch method, and how long the site gives the git it runs. As with `repo.connect`, the
 * site's budget is the shorter, so a slow command is stopped and reported by the site rather than abandoned by hq.
 * Making a copy installs nothing: dependencies come later, in the run.
 */
export const BRANCH_WORK_TIMEOUT_MS: number = 120_000
export const BRANCH_WORK_SITE_BUDGET_MS: number = 90_000

/** A code workspace: always a workspace, never an owner's own files. */
export type WorkspaceRepoRef = {
  ownerType: StorageOwnerType
  ownerId: string
  workspaceId: string
}

/** A commit's author or the person a commit is for, as Git writes them (`isGitPersonName`, `isGitEmail`). */
export type GitPerson = { name: string; email: string }

/** A full commit id (`isCommitId`), never an abbreviation or an expression. */
export type CommitId = string

/** One branch and its copy, in every call that acts in a copy. */
export type BranchCopyRef = {
  workspace: WorkspaceRepoRef
  /** `isCopyId`. */
  copyId: string
  /** `isGitBranchName`; never the workspace's `main`. */
  branch: string
}

export type BranchCreateParams = {
  workspace: WorkspaceRepoRef
  copyId: string
  /** A name hq gave (`isWorkBranchName`). Refused with `branch_exists` when the repository has it. */
  branch: string
}

/** For a branch the repository has (`not_found` otherwise); `copy_exists` when this copy id is already used. */
export type BranchCopyParams = BranchCopyRef

export type BranchCopyResult = {
  branch: string
  copyId: string
  /** The branch's tip, now checked out in the copy. */
  head: CommitId
  /** Where the branch left `main`: their merge base. */
  base: CommitId
}

/**
 * `author` is the agent; `onBehalfOf` is the person the work is for, written as an `On-behalf-of:` line at the end of
 * the message (live preview spec, *Defaults for review* 1). `runId` is the run whose tool call this is.
 */
export type BranchCommitParams = BranchCopyRef & {
  message: string
  author: GitPerson
  onBehalfOf: GitPerson | null
  runId: string
}

export type BranchCommitResult =
  | { committed: true; commit: CommitId; files: number; back: BranchBackResult }
  /** Nothing in the copy had changed. Nothing was committed. */
  | { committed: false; reason: 'nothing_to_commit' }
  /**
   * A merge from `main` is under way in the copy (`branch.updateFromMain`) and these of its clashing files still hold
   * Git's conflict markers. Nothing was committed.
   */
  | { committed: false; reason: 'clashes_left'; paths: string[] }

/**
 * `author` is the agent, `onBehalfOf` the person, as for `branch.commit`; they make the merge commit when nothing
 * clashes. `runId` is the run whose tool call this is.
 */
export type BranchUpdateFromMainParams = BranchCopyRef & {
  author: GitPerson
  onBehalfOf: GitPerson | null
  runId: string
}

/**
 * What bringing `main` into a copy's branch did.
 * - `updated`: `main` is in the branch, by a merge commit, or by moving the branch to `main` when it had nothing of
 *   its own (`fastForward`); the branch was brought back.
 * - `up_to_date`: the branch already had all of `main`. Nothing was changed.
 * - `clashes`: the merge is under way in the copy: the files named (at most `UPDATE_CLASH_PATHS_MAX`) hold Git's
 *   conflict markers, the rest of the merge is in the copy's working folder, and the copy's next `branch.commit`
 *   makes the merge commit with `main` (`mainTip`) as its second parent.
 * - `uncommitted`: the copy has changes not committed. Nothing was changed.
 * - `merge_under_way`: an earlier merge's clashes still wait for a commit. Nothing was changed.
 */
export type BranchUpdateFromMainResult =
  | { outcome: 'updated'; commit: CommitId; fastForward: boolean; back: BranchBackResult }
  | { outcome: 'up_to_date'; head: CommitId }
  | { outcome: 'clashes'; paths: string[]; mainTip: CommitId }
  | { outcome: 'uncommitted' }
  | { outcome: 'merge_under_way'; paths: string[] }

export type BranchBringBackParams = BranchCopyRef

/**
 * What bringing a branch back did. A branch whose history the agent rewrote moves anyway, and its old tip is kept
 * first as a branch of its own, `backup/<branch>-<YYYY-MM-DD>` (with `-2`, `-3` when taken), named in `backup`.
 */
export type BranchBackResult = {
  /** The branch's tip in the workspace's repository now. */
  head: CommitId
  /** Its tip before; null when the branch was new there. */
  previous: CommitId | null
  /** False when the copy had nothing new. */
  moved: boolean
  /** Set when the history was rewritten: the branch the old tip was kept as. */
  backup: string | null
}

/** `to` is `isWorkBranchName`; `copyId` names the branch's copy, renamed with it, when it has one. */
export type BranchRenameParams = {
  workspace: WorkspaceRepoRef
  from: string
  to: string
  copyId: string | null
}
export type BranchRenameResult = { renamed: true; name: string }

export type BranchDeleteParams = {
  workspace: WorkspaceRepoRef
  branch: string
  copyId: string | null
}
/** `lostCommits`: how many commits only that branch had. */
export type BranchDeleteResult = { deleted: true; lostCommits: number }

export type BranchRemoveCopyParams = { workspace: WorkspaceRepoRef; copyId: string }
/** `removed` is false when there was no such copy: removing is safe to ask twice. */
export type BranchRemoveCopyResult = { removed: boolean }

/** Why the site brought a branch back on its own, without hq asking. */
export type BranchBackCause = 'sweep' | 'run_end' | 'site_back'

/**
 * site → hq, `branch.back`: the site brought a branch back on its own, on its one-minute sweep while a run goes, at a
 * run's end (after committing what was left as *Work in progress*), or when it started again. Sent only when the
 * branch moved. hq tells the people who have the workspace open.
 */
export type BranchBackEvent = {
  workspace: WorkspaceRepoRef
  copyId: string
  branch: string
  cause: BranchBackCause
  back: BranchBackResult
  /** The run it happened in, for `sweep` and `run_end`. */
  runId: string | null
}

export const BRANCH_BACK_EVENT = 'branch.back'
