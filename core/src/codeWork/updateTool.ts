/**
 * The agent's `update_from_main` tool (live preview spec, *Agents can do more with Git than the view shows*; *A clash
 * merges nothing*): brings `main` into the run's branch, so an agent without its own `git` can still bring its branch
 * up to date after a clash. Offered to a run on a code workspace and forwarded like `commit`; hq asks the site to
 * merge in the run's own copy (`branch.updateFromMain`), and the commit helper does it there.
 *
 * - A clean merge is committed at once (the agent its author, the person in `On-behalf-of:`), and the branch goes
 *   back to the workspace's repository.
 * - On clashes, the clashing files are written into the copy with Git's conflict markers and the merge is recorded as
 *   under way. The agent edits those files, and its next `commit` makes the merge commit, with `main` as its second
 *   parent.
 *
 * Written for the baseline model: what it does, when to call it, and what to do after it, in short sentences.
 */
import type { CommitId } from '../protocol/branchWork.js'

export const UPDATE_TOOL_NAME = 'update_from_main'

export type UpdateToolDeclaration = {
  name: typeof UPDATE_TOOL_NAME
  description: string
  args: Record<string, never>
  runIdFromCaller: true
}

export const UPDATE_TOOL_DECLARATION: UpdateToolDeclaration = {
  name: UPDATE_TOOL_NAME,
  description:
    'Bring main into your branch: merges everything main has that your branch does not. Use it when you are told ' +
    'that files clash with main, or when the person asks you to bring your branch up to date. Commit your own ' +
    'changes first. If nothing clashes, the merge is committed for you and your branch is up to date. If files ' +
    'clash, they are named in the answer and written in your working folder with Git\'s conflict markers ' +
    '(<<<<<<<, =======, >>>>>>>): edit each one so it keeps both sides\' intent and has no markers left, check the ' +
    'work still works, then call commit. That commit finishes the merge. Never merge into main yourself.',
  args: {},
  runIdFromCaller: true,
}

export type UpdateToolArgs = Record<string, never>

/**
 * What the agent is told. `note` says the same in words, with what to do next.
 * - `updated`: main is in the branch now, by a merge commit or, when the branch had nothing of its own, by moving it.
 * - `up_to_date`: the branch already had everything main has.
 * - `clashes`: the merge is under way; the files named hold conflict markers until the agent's next `commit`.
 * - `uncommitted`: the working folder has changes not committed yet; nothing was done.
 * - `merge_under_way`: an earlier call's clashes still wait for the agent's `commit`; nothing was done.
 */
export type UpdateToolResult =
  | { updated: true; branch: string; main: string; commit: CommitId; note: string }
  | { updated: false; reason: 'up_to_date' | 'uncommitted'; branch: string; main: string; note: string }
  | { updated: false; reason: 'clashes' | 'merge_under_way'; branch: string; main: string; paths: string[]; note: string }

/** The most clashing paths the site names; the rest are counted by the agent's words. */
export const UPDATE_CLASH_PATHS_MAX = 200
