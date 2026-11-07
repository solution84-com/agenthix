/** The workspace view's words (live preview spec, parts 1 and 3), kept apart from the screens so they can be tested. */
import type { MergeClash } from '@agenthix/core'
import type { BranchLineView, BranchWhose, MergeBranchResult, RestoreVersionResult } from '../branches/views'

/** "You, with Kernel", "Mia, with Kernel", "Task SHOP-14", "Mia". `me`: the signed-in person's id. */
export function whoseLabel(whose: BranchWhose, agentName: string | null, me: string | null = null): string {
  const who = whose.kind === 'task'
    ? (whose.taskKey ? `Task ${whose.taskKey}` : 'A task')
    : whose.personId !== null && whose.personId === me ? 'You' : (whose.personName ?? 'A conversation')
  return agentName ? `${who}, with ${agentName}` : who
}

/** The branch's agent, working or not. */
export const agentOf = (line: BranchLineView): string | null => line.agentName ?? line.working?.agentName ?? null

/** "6 ahead", "3 ahead · 2 behind", "Nothing new". */
export function aheadText(ahead: number, behind: number): string {
  const parts: string[] = []
  if (ahead > 0) parts.push(`${ahead} ahead`)
  if (behind > 0) parts.push(`${behind} behind`)
  return parts.length ? parts.join(' · ') : 'Nothing new'
}

export function branchSubLine(line: BranchLineView, me: string | null = null): string {
  return `${whoseLabel(line.whose, agentOf(line), me)} · ${aheadText(line.ahead, line.behind)}`
}

export function workingText(line: BranchLineView): string {
  return line.working ? `${line.working.agentName} is working here` : 'No agent is working on it'
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The summary the Merge dialog starts with: "Kernel for Mia · Login page", "Kernel for task SHOP-9 · Product images". */
export function mergeSummary(line: BranchLineView): string {
  const forWhom = line.whose.kind === 'task'
    ? (line.whose.taskKey ? `task ${line.whose.taskKey}` : 'a task')
    : line.whose.personName
  const agent = agentOf(line)
  const by = agent && forWhom ? `${agent} for ${forWhom}` : agent ?? (forWhom && line.whose.kind === 'conversation' ? forWhom : null)
  const title = line.whose.title.trim() || line.name
  return (by ? `${by} · ${title}` : title).slice(0, 200)
}

/** The clashing files grouped by the version of `main` that changed them, newest first; null for one hq could not name. */
export function clashesByVersion(clashes: readonly MergeClash[]): { version: MergeClash['version']; paths: string[] }[] {
  const groups = new Map<string, { version: MergeClash['version']; paths: string[] }>()
  for (const c of clashes) {
    const key = c.version ? c.version.commit : ''
    const g = groups.get(key) ?? { version: c.version, paths: [] }
    g.paths.push(c.path)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => (b.version?.number ?? 0) - (a.version?.number ?? 0))
}

/** What a merge that did not go in says, or null for one that did. */
export function mergeRefusal(result: MergeBranchResult): string | null {
  switch (result.outcome) {
    case 'merged':
    case 'clash': return null
    case 'nothing_to_merge': return 'This branch has nothing new to merge since it left main or was last merged. Nothing was changed.'
    case 'main_moved': return 'main moved while this was open: someone merged or restored a version. Look at the changes again, then merge. Nothing was changed.'
  }
}

export function mergedNotice(result: Extract<MergeBranchResult, { outcome: 'merged' }>): string {
  return result.branchClosed
    ? `Merged into main as version ${result.versionNumber}. The branch is closed.`
    : `Merged into main as version ${result.versionNumber}. The branch stays open while its agent works.`
}

export function restoreNotice(result: RestoreVersionResult, restored: number): string {
  switch (result.outcome) {
    case 'restored': return `main is at version ${result.versionNumber}, with the files of version ${restored}.`
    case 'same_files': return `main already has exactly the files of version ${restored}. Nothing was changed.`
    case 'main_moved': return 'main moved while this was open: someone merged or restored a version. Look again, then restore. Nothing was changed.'
  }
}

/** "now", "5 min ago", "2 h ago", "yesterday", "4 days ago", "last week", or the date. */
export function whenText(iso: string | null, now = Date.now()): string {
  if (!iso) return ''
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const VIEWER_REASON = 'You can read everything here. Merging, restoring and talking to the agent need a Member or Admin of the project.'
export const DEPLOY_NONE =
  'No deploy workflow is set up for this workspace yet. To add one, ask an agent in a conversation to write a workflow that deploys main; once a person approves it, Deploy… runs it from here.'
export const DEPLOY_PREVIEW_ONLY =
  "The live preview's own workflows (start-live-preview, reload-live-preview) aren't listed here: they run from the live preview, with Start with secrets."
/** "Website relaunch's", "case-study-drafts'". */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

/**
 * Whether the signed-in person can open the chat a branch came from, by hq's reading rule: a conversation is readable
 * only by the person who opened it; a task's thread by the task's project members, who can all see the branch.
 */
export function canOpenBranchChat(whose: BranchWhose, me: string | null): boolean {
  return whose.kind === 'task' || (whose.personId !== null && whose.personId === me)
}

/** The first name of the person whose conversation a branch came from; "Someone" when they are not known. */
const opener = (whose: BranchWhose) => whose.personName?.trim().split(/\s+/)[0] || 'Someone'

/**
 * Where a branch came from, as its menu line starts: the conversation's title, or the task. With `me`, someone else's
 * conversation is named after its person: "Priya's conversation, Add a testimonials page".
 */
export function originText(whose: BranchWhose, me?: string | null): string {
  if (whose.kind === 'task') return whose.taskKey ? `task ${whose.taskKey}` : 'a task'
  const title = whose.title.trim() || 'a conversation'
  if (me === undefined || canOpenBranchChat(whose, me)) return title
  return `${possessive(opener(whose))} conversation, ${title}`
}

/** 💬 Chat on a branch whose chat the person cannot open: what it says, and why it is not offered. */
export function blockedChat(whose: BranchWhose): { label: string; why: string } {
  const name = opener(whose)
  return {
    label: `${possessive(name)} chat`,
    why: `Only ${name} can talk to this branch's agent. To change this workspace yourself, ask in any of your conversations; it gets a branch of its own.`,
  }
}

/**
 * The rest of a branch's one line, after where it came from: "Mia · 3 changes · 3 behind main", "Kernel working".
 * `changes` is the number of files it changed, when known.
 */
export function branchDetails(line: BranchLineView, me: string | null, changes: number | null = null): string {
  const parts: string[] = []
  // Someone else's conversation is named in the origin text, so the person is not said twice.
  if (line.whose.kind === 'conversation' && line.whose.personName && canOpenBranchChat(line.whose, me)) parts.push('You')
  if (line.working) parts.push(`${line.working.agentName} working`)
  if (changes !== null) parts.push(plural(changes, 'change'))
  if (line.behind > 0) parts.push(`${line.behind} behind main`)
  return parts.join(' · ')
}

/** Why the next step is *Bring up to date*: the button's hover. */
export function updateWhy(line: BranchLineView, clashed: boolean): string {
  const agent = agentOf(line) ?? "The branch's agent"
  const why = clashed ? 'This branch and main changed the same files.' : `main has ${plural(line.behind, 'newer version')}.`
  return `${why} ${agent} brings them into this branch, then you can merge.`
}

/** "v14 · latest", "v12". */
export const versionLabel = (number: number | null, latest: boolean) => (number === null ? 'An older version' : `v${number}${latest ? ' · latest' : ''}`)

export const returnWords = (number: number | null) =>
  `main gets a new version with exactly the files of ${number === null ? 'this version' : `version ${number}`}. Nothing is deleted from the history.`

export const gitOnNote = (gitignoreAdded: boolean) => (gitignoreAdded ? 'Git is on. A .gitignore was added.' : 'Git is on.')

export const VIEWER_UPDATE = 'Merging and bringing a branch up to date need a Member or Admin of the project.'
export const UPDATE_FAILED = 'The branch’s agent could not be asked to bring it up to date. Ask it in the branch’s chat. Nothing was changed.'
