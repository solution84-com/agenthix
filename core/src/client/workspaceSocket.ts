/**
 * A workspace's socket.io room, `workspace:<id>`: what hq tells the people who have a workspace open when one of its
 * branches or its `main` changes (live preview spec, part 1). Each event says what changed, not the new state: a
 * screen reads the branch list, Git's panel or `main`'s versions again. hq refuses a join silently when the person
 * may not read the workspace.
 *
 * For hq's own pages: the mobile app's list (./mobileApp.ts) does not name these, so they are not part of the client
 * protocol's versioned contract until it does.
 */

export const WORKSPACE_SOCKET = {
  /** Client → server, with the workspace's id. */
  subscribe: 'subscribeToWorkspace',
  unsubscribe: 'unsubscribeFromWorkspace',
  /** A branch changed. */
  branch: 'workspace:branch',
  /** `main` has a new version. */
  main: 'workspace:main',
} as const

/** What `subscribe` and `unsubscribe` send: the workspace's id, as a plain string. */
export type WorkspaceRoomArg = string

/**
 * - `created`: work started on a new branch; `renamed`, `deleted`: by a person.
 * - `commits`: commits came back to the workspace's repository (the `commit` tool, the site's sweep, a run's end).
 * - `working`, `stopped`: an agent started or stopped working on it.
 * - `merged`: it went into `main` (a `workspace:main` event comes with it); `closed`: after its merge, with no agent
 *   working on it, it closed and its copy was removed.
 */
export type WorkspaceBranchChange = 'created' | 'commits' | 'working' | 'stopped' | 'merged' | 'closed' | 'renamed' | 'deleted'

export type WorkspaceBranchEvent = {
  workspaceId: string
  /** hq's id for the branch (`WorkspaceBranch`), which a rename keeps. */
  branchId: string
  /** Its name now. */
  name: string
  change: WorkspaceBranchChange
}

export type WorkspaceMainChange = 'merged' | 'restored' | 'pulled' | 'git_on'

export type WorkspaceMainEvent = {
  workspaceId: string
  change: WorkspaceMainChange
  /** The newest version now, by its number. */
  version: number
  /** The branch whose merge made it, for `merged`. */
  branchId: string | null
}
