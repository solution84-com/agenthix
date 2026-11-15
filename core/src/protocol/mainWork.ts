/**
 * What moves a code workspace's `main`: turning Git on, *Merge into main*, *Restore*, and, for a
 * workspace connected to GitHub, pushing `main` and taking in versions pushed there by someone else. Each runs in the
 * commit helper in the workspace's own repository, with hooks off. The shared shapes and the rules every branch
 * method keeps are in `branchWork.ts`.
 *
 * A merge or a restore names the `main` the person saw (`expectedMain`): when `main` has moved since, nothing is
 * changed and the answer says so (`main_moved`), so a dialog that said *v15* never makes a v16.
 */
import type { CommitId, GitPerson, WorkspaceRepoRef } from './branchWork.js'
import type { BranchMergeBase, MainVersion } from './branchReads.js'

export const MAIN_WORK_METHODS = {
  /** Turn Git on for a workspace: `git init -b main` and the first version. */
  init: 'git.init',
  /** A branch's changes since its last merge go into `main` as one squashed version. */
  merge: 'git.merge',
  /** A new version of `main` whose files are exactly those of an earlier one. */
  restore: 'git.restore',
  pushMain: 'git.pushMain',
  pullMain: 'git.pullMain',
} as const

export const MAIN_WORK_TIMEOUT_MS: number = 120_000
export const MAIN_WORK_SITE_BUDGET_MS: number = 90_000

/** Files larger than this are left out of the first version, untracked, and named in `git.init`'s answer. */
export const GIT_INIT_LARGE_FILE_BYTES = 50 * 1024 * 1024

/** Written into the first version when the workspace has no `.gitignore` of its own. */
export const GIT_INIT_IGNORED = ['node_modules', 'dist', 'build', '.venv', '__pycache__', '.DS_Store'] as const

/** `author`: the person who turned Git on. Refused with `already_repository` when the folder is one. */
export type GitInitParams = { workspace: WorkspaceRepoRef; author: GitPerson }

export type GitInitResult = {
  main: string
  version: MainVersion
  /** True when the first version brought a `.gitignore` the workspace did not have. */
  gitignoreAdded: boolean
  /** Files left out for their size; they stay on disk, untracked. */
  leftOut: { path: string; bytes: number }[]
}

/**
 * `base`: the branch's last merge (null for its first); `message`: the summary, the new version's message; `author`:
 * the person who pressed *Merge*, or told the agent to. What the branch has committed goes in, at its tip now.
 */
export type GitMergeParams = {
  workspace: WorkspaceRepoRef
  branch: string
  base: BranchMergeBase | null
  expectedMain: CommitId
  message: string
  author: GitPerson
}

/** A file both sides changed, with the version of `main` that last changed it (null when no version names it). */
export type MergeClash = { path: string; version: { number: number; commit: CommitId; subject: string } | null }

export type GitMergeResult =
  /** `mergedCommit` is the branch's tip that went in: hq keeps it, with `version.commit`, as the next merge base. */
  | { merged: true; version: MainVersion; mergedCommit: CommitId }
  /** Nothing was merged. */
  | { merged: false; reason: 'clash'; clashes: MergeClash[] }
  | { merged: false; reason: 'nothing_to_merge' }
  | { merged: false; reason: 'main_moved'; main: CommitId }

/** `version`: the commit of the version restored, which must be on `main`'s first-parent line. */
export type GitRestoreParams = {
  workspace: WorkspaceRepoRef
  version: CommitId
  expectedMain: CommitId
  message: string
  author: GitPerson
}

export type GitRestoreResult =
  | { restored: true; version: MainVersion }
  /** `main` already has exactly those files. Nothing was changed. */
  | { restored: false; reason: 'same_files' }
  | { restored: false; reason: 'main_moved'; main: CommitId }

/**
 * `token`: hq's GitHub installation token, for this one call, never stored and never echoed, as in `repo.connect`.
 * The remote is the workspace's own GitHub repository, as its attachment names it, never one the repository's own
 * settings name.
 */
export type GitPushMainParams = { workspace: WorkspaceRepoRef; token: string }
export type GitPushMainResult =
  | { pushed: true; head: CommitId }
  /** GitHub has versions `main` lacks: take them in first (`git.pullMain`). Nothing was pushed. */
  | { pushed: false; reason: 'remote_ahead' }

export type GitPullMainParams = { workspace: WorkspaceRepoRef; token: string }
export type GitPullMainResult =
  /** The versions that arrived, oldest first; none when `main` was up to date. */
  | { pulled: true; head: CommitId; versions: MainVersion[] }
  /** `main` has versions GitHub lacks, so it cannot simply move forward. Nothing was changed. */
  | { pulled: false; reason: 'diverged' }
