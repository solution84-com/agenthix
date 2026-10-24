import type { WorkflowCheckFlag, WorkflowDefinition, WorkflowHost } from '@agenthix/core'
import type { CodeLine } from './code'

/** What the GitHub App and the repository's GitHub account may grant, or unknown until hq reads them (part 4). */
export type GitHubCeiling =
  | { known: false }
  | { known: true; app: WorkflowDefinition['github']; account: WorkflowDefinition['github'] }

export function flagAt(rule: number, message: string, at?: Pick<CodeLine, 'path' | 'line'> | { path: string }, high = false): WorkflowCheckFlag {
  const where = at ? { path: at.path, ...('line' in at && at.line ? { line: at.line } : {}) } : {}
  return { rule, high, message, ...where }
}

/** `steps[1].run` line 3, or `deploy/upload.sh` line 12, in words. */
export function placeWords(at: Pick<CodeLine, 'path' | 'line'>): string {
  const step = /^steps\[(\d+)\]\.run$/.exec(at.path)
  const where = step ? `step ${Number(step[1]) + 1}'s run` : at.path
  return `${where}, line ${at.line}`
}

export const stepWords = (i: number): string => `Step ${i + 1}`

export const hostKey = (h: WorkflowHost): string => `${h.host}:${h.port}`

/** `pull_requests` as GitHub's settings name it: "Pull requests". */
export function permissionWords(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
