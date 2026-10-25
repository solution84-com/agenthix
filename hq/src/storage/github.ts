/**
 * GitHub API helpers (ADR-0039, updated ADR-0037 §8) — repo creation, URL parsing. Tokens come from the mint gate
 * (`../github/mintGate.ts`); PAT and deploy keys retired.
 */

export type CreatedRepository = { repoUrl: string; id: number; ownerId: number }

/**
 * Create an EMPTY private repo under an organisation with a token from the mint gate's `mintForCreating`. Only an
 * ORGANISATION install can (POST /orgs/{org}/repos): installation tokens cannot create personal-account repos.
 */
export async function createGitHubRepo(token: string, owner: string, name: string, description: string): Promise<CreatedRepository> {
  const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(owner)}/repos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, private: true, auto_init: false }),
  })
  if (res.status === 422) throw new Error(`A repository named "${name}" already exists.`)
  if (!res.ok) throw new Error(`GitHub repo creation failed: ${await res.text()}`)
  const r = await res.json() as { id: number; full_name: string; owner: { id: number } }
  return { repoUrl: `https://github.com/${r.full_name}`, id: r.id, ownerId: r.owner.id }
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
