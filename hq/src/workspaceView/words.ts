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
export const TURN_GIT_ON_WORDS = (name: string) =>
  `${name} isn't a Git repository yet. Turning Git on keeps its files as they are and records them as the first version. From then on agents work on branches, and changes reach the files by merging.`
