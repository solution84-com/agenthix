/**
 * What GitHub says the App holds and what each account has accepted (workflows spec part 4, *the ceiling*): kept in
 * memory, filled whenever hq lists the App's installations, and read by the plain checks and the GitHub page.
 */
import { isGitHubRepositoryPermission, type GitHubPermissionLevel, type GitHubPermissions, type GitHubRepositoryPermission } from '@agenthix/core'

/** The repository permissions in GitHub's `permissions` object; `admin` counts as `write`, and unknown names are dropped. */
export function parsePermissions(raw: unknown): GitHubPermissions {
  const out: GitHubPermissions = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [name, level] of Object.entries(raw as Record<string, unknown>)) {
    if (!isGitHubRepositoryPermission(name)) continue
    if (level === 'read' || level === 'write' || level === 'admin') out[name] = level === 'read' ? 'read' : 'write'
  }
  return out
}

/** What every one of the accounts has: for each permission, the lowest level among them (none if one lacks it). */
export function commonPermissions(all: GitHubPermissions[]): GitHubPermissions {
  if (all.length === 0) return {}
  const out: GitHubPermissions = {}
  for (const [name, level] of Object.entries(all[0]) as [GitHubRepositoryPermission, GitHubPermissionLevel][]) {
    const others = all.slice(1).map((p) => p[name])
    if (others.some((l) => !l)) continue
    out[name] = level === 'read' || others.includes('read') ? 'read' : 'write'
  }
  return out
}

/** The account that owns the App: an organisation, or a person's own account. */
export type AppOwner = { login: string; type: 'Organization' | 'User' }

type Facts = { app: GitHubPermissions | null; owner: AppOwner | null; accounts: Map<number, GitHubPermissions>; at: number }

let facts: Facts = { app: null, owner: null, accounts: new Map(), at: 0 }

export function rememberFacts(app: GitHubPermissions | null, accounts: Map<number, GitHubPermissions>, now = Date.now()): void {
  facts = { app: app ?? facts.app, owner: facts.owner, accounts, at: now }
}

export function rememberAppPermissions(app: GitHubPermissions): void {
  facts = { ...facts, app }
}

export function rememberAppOwner(owner: AppOwner | null): void {
  facts = { ...facts, owner }
}

export function recalledFacts(): Facts {
  return facts
}

export function forgetFacts(): void {
  facts = { app: null, owner: null, accounts: new Map(), at: 0 }
}
