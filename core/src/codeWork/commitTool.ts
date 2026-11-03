/**
 * The agent's `commit` tool (live preview spec, *Commits, and the branch coming back*): offered to a run on a code
 * workspace, served by the site's MCP server and forwarded to hq's data API like the site's other forwarded tools,
 * and answered by hq, which asks the site to commit in the run's own copy (`branch.commit`). Declared once here so
 * the two sides cannot drift; each builds its own validator from `COMMIT_TOOL_DECLARATION`, as the workflow tools do.
 *
 * The tool acts for the calling run: the site fills in its `runId`, which tells hq the branch, its copy and the
 * person the work is for. The agent names only the message. The commit's author is the agent, with the person in an
 * `On-behalf-of:` line.
 */
import type { CommitId } from '../protocol/branchWork.js'

export const COMMIT_TOOL_NAME = 'commit'

/** The longest message the tool takes; the site adds the `On-behalf-of:` line after it. */
export const COMMIT_TOOL_MESSAGE_MAX = 2000

/** What a commit answers when the branch's live preview is open, so the agent shows the person its change. */
export const COMMIT_RELOAD_NOTE =
  "This branch's live preview is open: if this commit changed what the app shows, call reload_view now so the person " +
  'sees it (restart the app with start_app first if it only reads its files when it starts).'

export type CommitToolDeclaration = {
  name: typeof COMMIT_TOOL_NAME
  description: string
  args: { message: { type: 'string'; description: string; maxLength: number } }
  runIdFromCaller: true
}

export const COMMIT_TOOL_DECLARATION: CommitToolDeclaration = {
  name: COMMIT_TOOL_NAME,
  description:
    'Commit everything you changed in your working folder to your branch, with a message saying what changed and ' +
    'why. The commit goes straight back to the workspace\'s repository, where the person sees it. Commit each time ' +
    'a piece of the work is done and works. You can also use git yourself in your working folder; you never commit ' +
    'to main: a person merges your branch into main.',
  args: {
    message: {
      type: 'string',
      maxLength: COMMIT_TOOL_MESSAGE_MAX,
      description: 'The commit message: a short first line, such as "Add the login form", then more lines if needed',
    },
  },
  runIdFromCaller: true,
}

export type CommitToolArgs = { message: string }

export type CommitToolResult =
  /** `note`, added inside 1.12: set when the branch's live preview is open, saying to reload the person's view. */
  | { committed: true; commit: CommitId; branch: string; files: number; note?: string }
  | { committed: false; reason: 'nothing_to_commit' }
  /** A merge from main (`update_from_main`) is under way and these files still hold conflict markers; `note` says so. */
  | { committed: false; reason: 'clashes_left'; paths: string[]; note: string }
