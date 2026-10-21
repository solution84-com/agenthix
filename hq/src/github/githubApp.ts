/**
 * GitHub App credential service (ADR-0037 §8).
 * One org-scoped App; mints per-repo short-lived installation tokens. The single
 * accessor getTokenFor() is the security chokepoint + the ADR-0041 relocation seam.
 */
import { prisma } from 'wasp/server'
import { encryptSecret, decryptStoredSecret } from '../server/crypto/secretCrypto'
import { SignJWT, importPKCS8 } from 'jose'
import { createPrivateKey } from 'node:crypto'

const APP_NAME_PREFIX = 'agenthix'
// Reuse the existing Wasp URLs — no new env var. Server URL hosts the api routes
// (the redirect target); web client URL is the App's cosmetic homepage.
export const serverUrl = () => process.env.WASP_SERVER_URL ?? 'http://localhost:3001'
const WEB_URL = () => process.env.WASP_WEB_CLIENT_URL ?? 'http://localhost:3000'

export interface ManifestConversion {
  id: number
  slug: string
  pem: string
  webhook_secret?: string
  client_id?: string
  client_secret?: string
}

/** The App Manifest we POST to GitHub. default_permissions are exactly what the platform needs. */
export function buildManifest(state: string): Record<string, unknown> {
  return {
    name: `${APP_NAME_PREFIX}-${state.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}`,
    url: WEB_URL(),
    redirect_url: `${serverUrl()}/api/v1/github/app-manifest-callback`,
    // No webhook: GitHub rejects a localhost hook URL, and we consume no events yet
    // (run-surfacing polls the Actions API). Add hook_attributes when webhooks land + a public URL exists.
    public: false,
    default_permissions: {
      contents: 'write',
      actions: 'write',
      secrets: 'write',
      workflows: 'write',
      pull_requests: 'write', // agent opens PRs from pushed branches (via its installation token)
      administration: 'write', // repo creation on the installed org
      metadata: 'read',
    },
  }
}

/** Exchange the temporary manifest `code` for the App's permanent credentials. */
export async function convertManifestCode(code: string): Promise<ManifestConversion> {
  const res = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) throw new Error(`GitHub App manifest conversion failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<ManifestConversion>
}

/** Persist the conversion — private key, client secret and webhook secret encrypted at rest. */
export async function storeAppFromConversion(c: ManifestConversion): Promise<void> {
  await prisma.gitHubApp.create({
    data: {
      appId: c.id,
      slug: c.slug,
      privateKey: encryptSecret(c.pem),
      webhookSecret: c.webhook_secret ? encryptSecret(c.webhook_secret) : null,
      clientId: c.client_id ?? null,
      clientSecret: c.client_secret ? encryptSecret(c.client_secret) : null,
    },
  })
}

/**
 * The single stored App (one org). null until registered. Registering a second App is
 * refused, so there is one row; the ordering keeps the answer fixed if there ever are two.
 */
export async function getApp() {
  return prisma.gitHubApp.findFirst({ orderBy: { createdAt: 'asc' } })
}

/** Decrypted PEM for signing — server memory only. */
export async function getAppPrivateKey(): Promise<string> {
  const app = await getApp()
  const pem = app && decryptStoredSecret(app.privateKey, 'GitHub App private key')
  if (!pem) throw new Error('No GitHub App is registered. Register it under Organisation › Infrastructure › GitHub App.')
  return pem
}

interface CachedToken { token: string; expMs: number }
const tokenCache = new Map<string, CachedToken>()   // key: `${owner}/${repo}`

/** App JWT (RS256), 9-min TTL — GitHub caps at 10. Signed with the App private key. */
async function getAppJwt(): Promise<string> {
  const app = await getApp()
  if (!app) throw new Error('No GitHub App is registered.')
  const pem = await getAppPrivateKey()
  // GitHub issues App keys as PKCS#1 (BEGIN RSA PRIVATE KEY); jose's importPKCS8 needs
  // PKCS#8. node:crypto.createPrivateKey auto-detects PKCS#1/#8; re-export as a PKCS#8 PEM.
  const pkcs8 = createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' }) as string
  const key = await importPKCS8(pkcs8, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(String(app.appId))
    .sign(key)
}

/** Resolve repo → installation id. Refreshes installations from GitHub on a miss. */
async function resolveInstallationId(owner: string): Promise<number> {
  let inst = await prisma.gitHubInstallation.findFirst({ where: { accountLogin: owner } })
  if (!inst) {
    await refreshInstallations()
    inst = await prisma.gitHubInstallation.findFirst({ where: { accountLogin: owner } })
  }
  if (!inst) throw new Error(`The GitHub App is not installed on "${owner}". Install it on that org/account.`)
  return inst.installationId
}

/**
 * Sync GitHubInstallation with GitHub's current installation list: upsert what GitHub
 * reports and PRUNE rows it no longer reports (so uninstalling on GitHub + refresh
 * removes the org from our view). GitHub is the source of truth for installations.
 */
export async function refreshInstallations(): Promise<void> {
  const jwt = await getAppJwt()
  const res = await fetch('https://api.github.com/app/installations', {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) throw new Error(`Listing App installations failed (${res.status}): ${await res.text()}`)
  const installs = await res.json() as Array<{ id: number; account: { login: string; type: string } }>
  for (const i of installs) {
    await prisma.gitHubInstallation.upsert({
      where: { installationId: i.id },
      create: { installationId: i.id, accountLogin: i.account.login, accountType: i.account.type },
      update: { accountLogin: i.account.login, accountType: i.account.type },
    })
  }
  // Prune installations GitHub no longer reports (uninstalled). notIn [] prunes all.
  await prisma.gitHubInstallation.deleteMany({ where: { installationId: { notIn: installs.map(i => i.id) } } })
}

/** Forget the GitHub App credential entirely (platform-side). Does NOT delete the App on GitHub. */
export async function disconnectApp(): Promise<void> {
  await prisma.gitHubInstallation.deleteMany({})
  await prisma.gitHubApp.deleteMany({})
}

/** The mint-request body — scoped to one repo, least-privilege. Pure; unit-tested. */
export function buildInstallationTokenRequest(repoName: string): Record<string, unknown> {
  return {
    repositories: [repoName],
    permissions: { contents: 'write', actions: 'write', secrets: 'write', workflows: 'write', pull_requests: 'write', metadata: 'read' },
  }
}

/**
 * THE ACCESSOR. Mint a per-repo, ~1 hr installation token. Cached in memory until
 * 5 min before expiry. This is the single GitHub-credential chokepoint (run-context
 * gate point) and the ADR-0041 relocation seam.
 */
export async function getTokenFor(repo: { owner: string; name: string }): Promise<string> {
  const cacheKey = `${repo.owner}/${repo.name}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expMs - Date.now() > 5 * 60_000) return cached.token

  const installationId = await resolveInstallationId(repo.owner)
  const jwt = await getAppJwt()
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(buildInstallationTokenRequest(repo.name)),
  })
  if (!res.ok) throw new Error(`Minting installation token failed (${res.status}): ${await res.text()}`)
  const { token, expires_at } = await res.json() as { token: string; expires_at: string }
  tokenCache.set(cacheKey, { token, expMs: new Date(expires_at).getTime() })
  return token
}

/**
 * Mint an ORG-level installation token for repo creation. Unlike getTokenFor (per-repo,
 * least-privilege), this is not repo-scoped and carries `administration: write` — required
 * by POST /orgs/{org}/repos. Short-lived, not cached (used only at connect/init time).
 */
export async function getOrgToken(owner: string): Promise<string> {
  const installationId = await resolveInstallationId(owner)
  const jwt = await getAppJwt()
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { administration: 'write', contents: 'write' } }),
  })
  if (!res.ok) throw new Error(`Minting org token failed (${res.status}): ${await res.text()}`)
  const { token } = await res.json() as { token: string }
  return token
}
