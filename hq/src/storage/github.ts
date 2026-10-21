/**
 * GitHub API helpers (ADR-0039, updated ADR-0037 §8) — repo creation, owner resolution.
 * Credentials are minted via the GitHub App accessor (getTokenFor); PAT and deploy keys retired.
 */
import { getOrgToken, refreshInstallations } from '../github/githubApp'
import { prisma } from 'wasp/server'

/** The account to create repos under — prefer an org install (only orgs can create). Refreshes on a miss. */
async function appInstallation(): Promise<{ login: string; type: string }> {
  const pick = async () =>
    (await prisma.gitHubInstallation.findFirst({ where: { accountType: 'Organization' } }))
    ?? (await prisma.gitHubInstallation.findFirst())
  let inst = await pick()
  if (!inst) { await refreshInstallations(); inst = await pick() }
  if (!inst) throw new Error('The GitHub App is not installed anywhere yet. Install it on your org or account.')
  return { login: inst.accountLogin, type: inst.accountType }
}

/**
 * Create an EMPTY private repo via the App installation token. Returns the repoUrl.
 * Only works for an ORGANISATION install (POST /orgs/{org}/repos). Installation tokens
 * cannot create personal-account repos (POST /user/repos needs a user token) — so for a
 * personal install we direct the user to link an existing repo instead.
 */
export async function createGitHubRepo(name: string, description: string): Promise<string> {
  const { login: owner, type } = await appInstallation()
  if (type !== 'Organization') {
    throw new Error(
      'Creating a new repo requires the GitHub App installed on an organization. ' +
      'Your App is installed on a personal account — link an existing repo instead.',
    )
  }
  const token = await getOrgToken(owner)
  const res = await fetch(`https://api.github.com/orgs/${owner}/repos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, private: true, auto_init: false }),
  })
  if (res.status === 422) throw new Error(`A repository named "${name}" already exists.`)
  if (!res.ok) throw new Error(`GitHub repo creation failed: ${await res.text()}`)
  return `https://github.com/${owner}/${name}`
}

/** The repoUrl an existing repo of this (slugged) name would have under the App's install — for adopt/consolidate. */
export async function installRepoUrl(name: string): Promise<string> {
  const { login: owner } = await appInstallation()
  return `https://github.com/${owner}/${toRepoSlug(name)}`
}

// Anchored: the owner and name decide which repository a token is minted for, and
// git is then given this URL — so nothing but github.com may parse (spec §4.26).
const GITHUB_REPO_URL = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?$/

export function parseRepo(repoUrl: string): { owner: string; name: string } {
  const m = GITHUB_REPO_URL.exec(repoUrl)
  if (!m || m[2] === '.' || m[2] === '..') throw new Error(`Invalid GitHub repo URL: ${repoUrl}`)
  return { owner: m[1], name: m[2] }
}

export function toRepoSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
