/**
 * GitHub App credential service (ADR-0037 §8): the App's registration, its JWT and its installations.
 * Installation tokens are minted only by the mint gate (`mintGate.ts`).
 */
import { prisma } from 'wasp/server'
import { encryptSecret, decryptStoredSecret } from '../server/crypto/secretCrypto'
import { SignJWT, importPKCS8 } from 'jose'
import { createPrivateKey } from 'node:crypto'
import { parsePermissions, rememberFacts } from './permissionFacts'
import type { GitHubPermissions } from '@agenthix/core'

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

/**
 * The name GitHub's page starts with: "Agenthix for <the organisation's name>", which is what its clients see when they
 * install the App. The organisation's bare name would usually be refused, because GitHub reserves an App name that
 * matches an account's login. GitHub takes up to 34 characters of letters, digits, spaces and `-_.()`; a name already
 * taken is changed there, on GitHub's page. With no usable name, a generated one.
 */
export function defaultAppName(orgName: string | null | undefined, state: string): string {
  const prefix = 'Agenthix for '
  const name = (orgName ?? '').replace(/[^A-Za-z0-9 ._()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 34 - prefix.length).trim()
  return /^[A-Za-z0-9]/.test(name) ? `${prefix}${name}` : `${APP_NAME_PREFIX}-${state.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}`
}

/** The App Manifest we POST to GitHub. default_permissions are exactly what the platform needs. */
export function buildManifest(state: string, orgName?: string | null): Record<string, unknown> {
  return {
    name: defaultAppName(orgName, state),
    url: WEB_URL(),
    redirect_url: `${serverUrl()}/api/v1/github/app-manifest-callback`,
    // After someone installs the App, or changes what it can reach, GitHub sends them back to HQ's GitHub page, which
    // then looks for the new installation (there is no Refresh button).
    setup_url: `${WEB_URL()}/admin/settings/github`,
    setup_on_update: true,
    // No webhook: GitHub rejects a localhost hook URL, and we consume no events yet
    // (run-surfacing polls the Actions API). Add hook_attributes when webhooks land + a public URL exists.
    public: true, // anyone can install it; a new installation is used only once an administrator allows it
    default_permissions: {
      contents: 'write',
      actions: 'write',
      secrets: 'write',
      workflows: 'write',
      pull_requests: 'write', // agent opens PRs from pushed branches (via its installation token)
      administration: 'write', // repo creation on the installed org
      environments: 'write', // set-github-secrets: environment secrets, and the environment limited to protected branches
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
  if (!pem) throw new Error('No GitHub App is registered. Register it under Manage organisation › Infrastructure › GitHub App.')
  return pem
}

/** App JWT (RS256), 9-min TTL — GitHub caps at 10. Signed with the App private key. */
export async function getAppJwt(): Promise<string> {
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
  const installs = await res.json() as Array<{
    id: number; account: { id: number; login: string; type: string }; repository_selection?: string; permissions?: unknown
  }>
  const accepted = new Map<number, GitHubPermissions>()
  for (const i of installs) {
    const seen = {
      accountLogin: i.account.login, accountType: i.account.type, accountId: BigInt(i.account.id),
      repositorySelection: i.repository_selection ?? null,
    }
    accepted.set(i.id, parsePermissions(i.permissions))
    await prisma.gitHubInstallation.upsert({ where: { installationId: i.id }, create: { installationId: i.id, ...seen }, update: seen })
  }
  rememberFacts(null, accepted)
  // Prune installations GitHub no longer reports (uninstalled). notIn [] prunes all.
  await prisma.gitHubInstallation.deleteMany({ where: { installationId: { notIn: installs.map(i => i.id) } } })
}

/** Forget the GitHub App credential entirely (platform-side). Does NOT delete the App on GitHub. */
export async function disconnectApp(): Promise<void> {
  await prisma.gitHubInstallation.deleteMany({})
  await prisma.gitHubApp.deleteMany({})
}
