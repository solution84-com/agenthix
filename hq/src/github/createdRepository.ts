/** Reading and deleting a repository under an account, with the creating token (`administration` only) from the mint gate. */

const HEADERS = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' })

/** The repository if it exists under the account; null when GitHub says it does not. */
export async function findGitHubRepository(token: string, owner: string, name: string): Promise<{ repoUrl: string; id: number } | null> {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers: HEADERS(token) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub could not say whether ${owner}/${name} exists (status ${res.status}).`)
  const r = await res.json() as { id: number; full_name: string }
  return { repoUrl: `https://github.com/${r.full_name}`, id: r.id }
}

/** Deletes a repository hq just created. True when it is gone (a 404 counts: nothing is left to remove). */
export async function deleteGitHubRepository(token: string, owner: string, name: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
    method: 'DELETE', headers: HEADERS(token),
  })
  return res.status === 204 || res.status === 404
}
