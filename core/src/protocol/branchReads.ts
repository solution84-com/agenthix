/**
 * Reading a code workspace's branches and `main` (site protocol 1.12): what the workspace view's branch select, Git's
 * panel, a file's changes and `main`'s versions are drawn from. Read only, all of it, and read from the workspace's
 * own repository, which no agent can write; the copies are never read here. The shared shapes and the rules every
 * method keeps are in `branchWork.ts`.
 */
import type { CommitId, WorkspaceRepoRef } from './branchWork.js'

export const BRANCH_READ_METHODS = {
  /** `main` and every branch, each with how far ahead of and behind `main` it is. */
  list: 'branch.list',
  /** A branch's changed files against where it left `main`, or against its last merge. */
  changes: 'branch.changes',
  /** A branch's commits since that same base, newest first. */
  commits: 'branch.commits',
  /** One file's text at a commit or a branch's tip, for the diff view. */
  readFile: 'git.readFile',
  /** `main`'s versions, newest first. */
  versions: 'git.versions',
  /** One folder's entries at a commit or a branch's tip: what Files shows, tracked files only. */
  listTree: 'git.listTree',
} as const

export const BRANCH_READ_TIMEOUT_MS: number = 15_000
export const BRANCH_READ_SITE_BUDGET_MS: number = 10_000

/** The most of a file `git.readFile` answers; a larger one answers `tooLarge`. */
export const GIT_FILE_TEXT_MAX_BYTES = 512 * 1024
/** The most entries a list answers; past it, `overflow` is true. */
export const BRANCH_LIST_MAX = 500
export const BRANCH_CHANGES_MAX = 1000
export const BRANCH_COMMITS_MAX = 200
export const GIT_VERSIONS_MAX = 200
export const GIT_TREE_MAX = 2000

/**
 * A branch's last merge into `main`, as hq keeps it (`WorkspaceBranch`): the branch's commit that was merged, and the
 * version of `main` the merge made. Counting from these, a branch merged as a checkpoint and then continued is ahead
 * by what came after, and not behind by its own merge.
 */
export type BranchMergeBase = {
  /** The branch's commit that went in: the merge base for the next merge. */
  mergedCommit: CommitId
  /** The version of `main` the merge made. */
  mergedVersion: CommitId
}

/** One commit, as the view shows it. A type, not an interface, so it passes as a Wasp payload. */
export type GitCommitLine = {
  id: CommitId
  /** The first line of its message. */
  subject: string
  author: { name: string; email: string }
  /** The person named in an `On-behalf-of:` line, when the message has one. */
  onBehalfOf: { name: string; email: string } | null
  /** ISO, when it was committed. */
  at: string
}

export type BranchListParams = {
  workspace: WorkspaceRepoRef
  /** Each branch's last merge, for the branches that have one. Ahead and behind count from it. */
  merged: { branch: string; base: BranchMergeBase }[]
}

/**
 * A branch in the repository. Its name is whatever the repository holds, an agent's own `backup/…` included, so a
 * reader shows it as text and checks it (`isGitBranchName`) before naming it in a call; one that fails is left out.
 */
export type BranchLine = {
  name: string
  head: CommitId
  /** Commits it has that `main` lacks, counted from its last merge when it has one. */
  ahead: number
  /** Commits `main` has that it lacks, its own merges left out. */
  behind: number
  lastCommit: GitCommitLine
}

export type BranchListResult = {
  /** The branch the workspace's folder has checked out, and its tip; `versions` is how many it has. */
  main: { name: string; head: CommitId; versions: number }
  branches: BranchLine[]
  overflow: boolean
}

export type BranchChangesParams = {
  workspace: WorkspaceRepoRef
  branch: string
  /** The branch's last merge; null counts from where it left `main`. */
  base: BranchMergeBase | null
}

export type BranchFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export type BranchFileChange = {
  path: string
  status: BranchFileStatus
  /** For a rename, the path it had. */
  from: string | null
  /** Lines added and removed; null for a binary file. */
  additions: number | null
  deletions: number | null
}

export type BranchChangesResult = {
  /** The commit the changes are counted from, and the branch's tip: the two sides of each file's diff. */
  base: CommitId
  head: CommitId
  files: BranchFileChange[]
  overflow: boolean
}

export type BranchCommitsParams = BranchChangesParams & { limit: number }
export type BranchCommitsResult = { commits: GitCommitLine[]; overflow: boolean }

/** A commit, or a branch's tip in the workspace's repository. Never an expression such as `HEAD~1`. */
export type GitRev = { commit: CommitId } | { branch: string }

/** `path` is `isRepoPath`. */
export type GitReadFileParams = { workspace: WorkspaceRepoRef; rev: GitRev; path: string }

export type GitReadFileResult =
  | { exists: false }
  | { exists: true; binary: true; bytes: number }
  | { exists: true; binary: false; tooLarge: true; bytes: number }
  | { exists: true; binary: false; tooLarge: false; bytes: number; text: string }

/** `path` is `isRepoPath`, or `''` for the top folder. */
export type GitListTreeParams = { workspace: WorkspaceRepoRef; rev: GitRev; path: string }

export type GitTreeEntry = { name: string; path: string; kind: 'file' | 'dir'; bytes: number | null }

/** Folders first, then files, each by name. `exists: false` when the folder is not in that commit. */
export type GitListTreeResult = { exists: false } | { exists: true; entries: GitTreeEntry[]; overflow: boolean }

/** `before`: the oldest version already shown, to read the page after it. */
export type GitVersionsParams = { workspace: WorkspaceRepoRef; limit: number; before: CommitId | null }

/** One version of `main`: one commit on its first-parent line, numbered from the first (*v1*). */
export type MainVersion = {
  number: number
  commit: CommitId
  subject: string
  /** Who merged or restored it, as the commit names them. */
  author: { name: string; email: string }
  /** How many files it changed against the version before it. */
  files: number
  at: string
}

export type GitVersionsResult = { versions: MainVersion[]; total: number; overflow: boolean }
