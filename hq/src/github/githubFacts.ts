/** Reads the App's real permissions and each account's accepted ones from GitHub, and keeps them fresh. */
import type { GitHubPermissions } from '@agenthix/core'
import { getApp, getAppJwt, refreshInstallations } from './githubApp'
import { parsePermissions, recalledFacts, rememberAppOwner, rememberAppPermissions, type AppOwner } from './permissionFacts'

/** Facts older than this are read again before a check uses them. */
const FRESH_MS = 5 * 60_000

/** The App as GitHub has it: its permissions, and the account that owns it. */
export async function fetchApp(): Promise<{ permissions: GitHubPermissions; owner: AppOwner | null }> {
  const res = await fetch('https://api.github.com/app', {
    headers: { Authorization: `Bearer ${await getAppJwt()}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) throw new Error(`Reading the App from GitHub failed (${res.status}).`)
  const body = (await res.json()) as { permissions?: unknown; owner?: { login?: unknown; type?: unknown } | null }
  const login = typeof body.owner?.login === 'string' ? body.owner.login : null
  const type = body.owner?.type === 'Organization' ? 'Organization' : 'User'
  return { permissions: parsePermissions(body.permissions), owner: login ? { login, type } : null }
}

/** Lists the installations (recording their accepted permissions) and reads the App's own. */
export async function refreshGitHubFacts(): Promise<void> {
  await refreshInstallations()
  const app = await fetchApp()
  rememberAppPermissions(app.permissions)
  rememberAppOwner(app.owner)
}

/** The facts as last read, read again when older than five minutes. Null when no App is registered or GitHub can't be reached. */
export async function currentFacts(): Promise<ReturnType<typeof recalledFacts> | null> {
  if (!(await getApp())) return null
  if (Date.now() - recalledFacts().at > FRESH_MS || !recalledFacts().app) {
    try { await refreshGitHubFacts() } catch { return recalledFacts().app ? recalledFacts() : null }
  }
  return recalledFacts()
}
