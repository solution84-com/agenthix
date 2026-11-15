/**
 * A folder's git status at a glance, on the control channel: what hq asks a site when a workspace
 * or the Files tool opens, and again on focus, to draw one line above the files. Read only: nothing is checked out,
 * committed or fetched, and nothing in the repository's own configuration runs (the site's handler says how).
 *
 * The folder is a workspace or an owner's `files/` (`loc`), confined as the site confines any location. A folder that
 * is not a repository is an answer (`repository: false`), not a refusal. A refusal is a `RepoWorkError`, the same
 * vocabulary repository work uses, and names no path on the site's disk.
 */
import type { LocationRef } from '../storage/locationRef.js'

export const GIT_STATUS_METHOD = 'git.status'

/**
 * How long hq waits for `git.status`, and how long the site gives the git it runs. As with `repo.connect`, the site's
 * budget is the shorter, so a slow read is stopped and reported by the site rather than abandoned by hq.
 */
export const GIT_STATUS_TIMEOUT_MS: number = 15_000
export const GIT_STATUS_SITE_BUDGET_MS: number = 10_000

export interface GitStatusParams {
  loc: LocationRef
}

/** A branch checked out, or a commit checked out on its own (its short id). */
export type GitHead = { kind: 'branch'; name: string } | { kind: 'detached'; commit: string }

/** A type, not an interface, so it passes as a Wasp payload. */
export type GitLastCommit = {
  /** The short id. */
  id: string
  /** The first line of its message. */
  subject: string
  author: string
  /** ISO, when it was committed. */
  at: string
}

/** A merge or a rebase stopped halfway, as an agent can leave one. */
export type GitInProgress = 'merge' | 'rebase'

export type GitStatusResult =
  | { repository: false }
  | {
    repository: true
    head: GitHead
    /** Changed files: modified, staged, deleted, renamed and new (untracked) ones. With no commits, every file is new. */
    changed: number
    /** More files changed than were counted; `changed` is a floor. */
    changedOverflow: boolean
    /** Null before the first commit. */
    lastCommit: GitLastCommit | null
    inProgress: GitInProgress | null
  }
