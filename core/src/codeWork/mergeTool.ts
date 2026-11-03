/**
 * The agent's `merge_into_main` tool (live preview spec, *Merge into main*): offered to a run on a code workspace,
 * forwarded by the site to hq's data path like `commit`. It merges nothing itself: hq puts a confirmation in the
 * branch's conversation or task thread (*Kernel will merge add-login-page into main as one version* · *Merge* ·
 * *Not now*), and the merge happens when a person who may merge presses *Merge*, as that person. hq cannot tell from
 * an agent's words whether the person asked, so their press is the check. The agent names only an optional summary;
 * hq finds the branch from the calling run.
 *
 * Written for the baseline model: it says plainly that it is used at once when the person asks (directly, or passed on
 * in a brief), never otherwise, and that they confirm.
 */

export const MERGE_TOOL_NAME = 'merge_into_main'

/** The longest summary the tool takes: the new version's message. */
export const MERGE_TOOL_SUMMARY_MAX = 2000

export type MergeToolDeclaration = {
  name: typeof MERGE_TOOL_NAME
  description: string
  args: { summary: { type: 'string'; description: string; maxLength: number; optional: true } }
  runIdFromCaller: true
}

export const MERGE_TOOL_DECLARATION: MergeToolDeclaration = {
  name: MERGE_TOOL_NAME,
  description:
    'Ask the person to merge your branch into main, as one new version. It does not merge by itself: it shows the ' +
    'person a confirmation with Merge and Not now, and the merge happens only when they press Merge. Call it as ' +
    'soon as the person asks you to merge into main, whether they ask you directly or their ask is passed on to you ' +
    'in a brief or a message ("merge it", "merge your branch into main", "ship it to main"). Call it in that same ' +
    'step: do not tell them to press Merge themselves, and do not ask first whether to show the confirmation. Never ' +
    'call it because the work looks finished and nobody asked: the person reviews it and decides. Commit your work ' +
    'first; only what is committed is merged. After calling it, tell the person the confirmation is waiting for ' +
    'them, and do not call it again for the same work. If you are later told that files clash with main, call ' +
    'update_from_main, resolve the clashes it names, commit, tell the person, and call this again only when they ' +
    'ask again.',
  args: {
    summary: {
      type: 'string',
      maxLength: MERGE_TOOL_SUMMARY_MAX,
      optional: true,
      description: 'One line saying what the work does, for main\'s history. Leave it out to use the work\'s title',
    },
  },
  runIdFromCaller: true,
}

export type MergeToolArgs = { summary?: string }

/**
 * Nothing was merged yet: the person was asked to confirm. `alreadyAsked` when a confirmation for this branch was
 * already waiting for them, so no second one was made. `note` says so in words for the agent.
 */
export type MergeToolResult = { asked: true; branch: string; main: string; alreadyAsked: boolean; note: string }
