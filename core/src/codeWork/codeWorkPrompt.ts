/**
 * What a run on a code workspace is told in its prompt (live preview spec, *What agents are told*): its own branch,
 * how far behind `main` it is, and the other branches of the workspace, so it can see what others are already
 * changing before it repeats their work; and that it has the app tools, every run, so a long conversation does not go
 * on believing an earlier reply that said it had none. Built from the run's `codeWork` (protocol/codeWork.ts) by whoever builds the
 * prompt, so the words are the same wherever they are shown. Written for the baseline model: short, plain sentences.
 */
import type { RunCodeWork } from '../protocol/codeWork.js'
import { COMMIT_TOOL_NAME } from './commitTool.js'
import { MERGE_TOOL_NAME } from './mergeTool.js'
import { UPDATE_TOOL_NAME } from './updateTool.js'
import { LIST_APPS_TOOL, RELOAD_VIEW_TOOL, SET_AUTO_RELOAD_TOOL, START_APP_TOOL, STOP_APP_TOOL } from '../livePreview/appTools.js'

/** The most other branches named; the rest are counted. */
export const CODE_WORK_PROMPT_BRANCHES_MAX = 20

const commits = (n: number) => `${n} commit${n === 1 ? '' : 's'}`

export function codeWorkPromptText(work: RunCodeWork): string {
  const lines = [
    '# Your branch',
    '',
    `You work on the branch \`${work.branch}\` of this workspace's Git repository, in a working copy of your own: your ` +
      'working folder. Everything you change there is on your branch only.',
    `- The workspace's own folder is \`${work.main}\`, which you can read but not write. Your work reaches ` +
      `\`${work.main}\` only when a person merges your branch.`,
    `- Commit as you go, each time a piece of the work is done and works: with the \`${COMMIT_TOOL_NAME}\` tool, or ` +
      'with git in your working folder. Each commit goes straight back to the workspace, where people see it. ' +
      'Anything you leave uncommitted is committed for you when your run ends.',
    `- To bring \`${work.main}\` into your branch, call \`${UPDATE_TOOL_NAME}\`. If it names clashing files, edit ` +
      `each to remove Git's conflict markers, then call \`${COMMIT_TOOL_NAME}\` to finish the merge. You may also use git ` +
      `as you need in your working folder: squash or reword commits, rebase onto \`${work.main}\`. Never try to change ` +
      `\`${work.main}\` itself.`,
    `- When the person asks you to merge into \`${work.main}\` (directly, or passed on to you in a brief), call ` +
      `\`${MERGE_TOOL_NAME}\` at once, in that step: it shows them a confirmation, and the merge happens when they ` +
      'press Merge. Do not tell them to merge it themselves. Never call it when nobody asked.',
    '- Install npm packages with `install_packages`. Packages install with their install scripts off, then the ' +
      'scripts of well-known, widely used packages run. An install you run yourself runs no install scripts.',
    '',
    '# Your app tools',
    '',
    `This run has the app tools: \`${START_APP_TOOL}\`, \`${STOP_APP_TOOL}\`, \`${LIST_APPS_TOOL}\`, \`${RELOAD_VIEW_TOOL}\` ` +
      `and \`${SET_AUTO_RELOAD_TOOL}\`. They act on your branch's live preview: your app, running from your working ` +
      'folder, which the person sees beside your conversation.',
    `- When the person asks to see the app, or to run, start or show it, call \`${START_APP_TOOL}\` yourself. If no live ` +
      `preview is open for your branch, it opens one first. Then call \`${LIST_APPS_TOOL}\` to see whether the app runs, ` +
      'or why it failed.',
    '- These tools are offered on every run of yours, this one included. If an earlier reply in this conversation said ' +
      'you have no app tools, that no longer holds: call the tool instead of saying so again.',
    '',
    work.behindMain === 0
      ? `Your branch has everything \`${work.main}\` has.`
      : `\`${work.main}\` has ${commits(work.behindMain)} your branch does not have. Bringing them in is your call ` +
        `(\`${UPDATE_TOOL_NAME}\`): do it when your work touches the same files, or when the person asks.`,
  ]
  const others = work.otherBranches
  if (others.length === 0) {
    lines.push('', 'No other branch of this workspace has work on it.')
  } else {
    lines.push('', 'Other branches of this workspace, so you can see what is already being changed:')
    for (const b of others.slice(0, CODE_WORK_PROMPT_BRANCHES_MAX)) {
      const who = b.agentWorking ? `; ${b.agentWorking} is working on it now` : ''
      lines.push(`- \`${b.name}\`: ${b.whose}; ${commits(b.ahead)} ahead of \`${work.main}\`${who}`)
    }
    const more = others.length - CODE_WORK_PROMPT_BRANCHES_MAX
    if (more > 0) lines.push(`- and ${more} more`)
    lines.push(
      'If your task repeats work one of them already does, say so to the person before you do it again ' +
        '(for example: "Ada\'s branch login-form already changes the login form").',
    )
  }
  return lines.join('\n')
}
