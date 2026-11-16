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

import type { ToolArea } from '../harness/toolAreas.js'

export const MERGE_TOOL_NAME = 'merge_into_main'

/** The longest summary the tool takes: the new version's message. */
export const MERGE_TOOL_SUMMARY_MAX = 2000

export type MergeToolDeclaration = {
  name: typeof MERGE_TOOL_NAME
  area: ToolArea
  description: string
  args: { summary: { type: 'string'; description: string; maxLength: number; optional: true } }
  runIdFromCaller: true
}

export const MERGE_TOOL_DECLARATION: MergeToolDeclaration = {
  name: MERGE_TOOL_NAME,
  area: 'code',
  description:
    'Ask the person to merge your branch into main, as one new version: it shows them a confirmation, and the merge ' +
    'happens only when they press Merge. Call it as soon as they ask ("merge it", "ship it to main"), directly or ' +
    'passed on to you in a brief, in that same step, without asking first. Never call it because the work looks ' +
    'finished and nobody asked. Only what is committed is merged. Then tell them the confirmation is waiting, and do ' +
    'not call it again for the same work. If files later clash with main: update_from_main, resolve, commit, tell ' +
    'the person, and call this again only when they ask.',
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
