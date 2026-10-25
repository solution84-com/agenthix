/**
 * GitHub's installation-token endpoints, for the mint gate (`mintGate.ts`) alone: nothing else in hq asks GitHub for
 * an installation token, and a test holds every other file to that.
 */
import type { GitHubPermissions } from '@agenthix/core'
import { getAppJwt } from './githubApp'

const API = 'https://api.github.com'

/** What a token reaches, as GitHub answered the mint: the repositories by id, with their current names. */
export type MintedRepository = { id: number; name: string; fullName: string; ownerId: number; ownerLogin: string }

export type InstallationToken = {
  token: string
  expiresAt: Date
  permissions: GitHubPermissions
  /** Empty for a token asked for without repositories. */
  repositories: MintedRepository[]
}

/** One installation token. Exactly one of `repositoryIds` and `repositoryNames` scopes it, or neither for creating one. */
export type TokenAsk = {
  installationId: number
  permissions: GitHubPermissions
  repositoryIds?: number[]
  repositoryNames?: string[]
}

export class GitHubTokenError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function tokenRequestBody(ask: TokenAsk): Record<string, unknown> {
  const body: Record<string, unknown> = { permissions: ask.permissions }
  if (ask.repositoryIds) body.repository_ids = ask.repositoryIds
  if (ask.repositoryNames) body.repositories = ask.repositoryNames
  return body
}

type MintAnswer = {
  token: string
  expires_at: string
  permissions?: GitHubPermissions
  repositories?: Array<{ id: number; name: string; full_name: string; owner: { id: number; login: string } }>
}

export async function requestInstallationToken(ask: TokenAsk): Promise<InstallationToken> {
  const jwt = await getAppJwt()
  const res = await fetch(`${API}/app/installations/${ask.installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(tokenRequestBody(ask)),
  })
  // GitHub's answer to a refused mint names no token, so its text is safe to pass on.
  if (!res.ok) throw new GitHubTokenError(res.status, (await res.text().catch(() => '')).slice(0, 500))
  const a = await res.json() as MintAnswer
  return {
    token: a.token,
    expiresAt: new Date(a.expires_at),
    permissions: a.permissions ?? {},
    repositories: (a.repositories ?? []).map((r) => ({
      id: r.id, name: r.name, fullName: r.full_name, ownerId: r.owner.id, ownerLogin: r.owner.login,
    })),
  }
}

/** Ends a token at once. True when GitHub has it ended: revoked now (204), or no longer working (401). */
export async function revokeInstallationToken(token: string): Promise<boolean> {
  const res = await fetch(`${API}/installation/token`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  return res.status === 204 || res.status === 401
}
