/**
 * What the site knows, in memory, about the work around its live previews: the runs going on each branch (for
 * `noRun`, the guard's pattern and the idle stop), whom those runs' commits name (for the *Work in progress* commit
 * when a live preview's own copy stops), and the site's own commands going in each live preview's container.
 */
import type { GitPerson } from '@agenthix/core'

const key = (workspaceId: string, branch: string) => `${workspaceId}\u0000${branch}`

const going = new Map<string, Set<string>>()
const authors = new Map<string, { author: GitPerson; onBehalfOf: GitPerson | null }>()
const siteExecs = new Map<string, number>()

export function runStarted(workspaceId: string, branch: string, runId: string, who: { author: GitPerson; onBehalfOf: GitPerson | null }): void {
  const k = key(workspaceId, branch)
  const set = going.get(k) ?? new Set<string>()
  set.add(runId)
  going.set(k, set)
  authors.set(k, who)
}

export function runEnded(workspaceId: string, branch: string, runId: string): void {
  going.get(key(workspaceId, branch))?.delete(runId)
}

export function runGoing(workspaceId: string, branch: string, runId: string): boolean {
  return going.get(key(workspaceId, branch))?.has(runId) ?? false
}

export function anyRunGoing(workspaceId: string, branch: string): boolean {
  return (going.get(key(workspaceId, branch))?.size ?? 0) > 0
}

export function lastAuthors(workspaceId: string, branch: string): { author: GitPerson; onBehalfOf: GitPerson | null } | null {
  return authors.get(key(workspaceId, branch)) ?? null
}

/** A command of the site's own begins in a live preview's container; call the answer when it ends. */
export function siteExecBegins(id: string): () => void {
  siteExecs.set(id, (siteExecs.get(id) ?? 0) + 1)
  let done = false
  return () => {
    if (done) return
    done = true
    const n = (siteExecs.get(id) ?? 1) - 1
    if (n <= 0) siteExecs.delete(id)
    else siteExecs.set(id, n)
  }
}

export function siteExecGoing(id: string): boolean {
  return (siteExecs.get(id) ?? 0) > 0
}

export function resetActivityForTests(): void {
  going.clear()
  authors.clear()
  siteExecs.clear()
}
