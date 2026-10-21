import { recordError } from '../diagnostics/recordedErrors'
import { githubAdvice } from '../diagnostics/errorAdvice'

/** `owner/name` of a repository path, or the path's first part, to group what GitHub refused. */
function repositoryOf(path: string): string {
  const m = /^\/repos\/([^/]+\/[^/?]+)/.exec(path)
  return m ? m[1] : path.split(/[/?]/).filter(Boolean)[0] ?? path
}

export async function githubFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const error = `GitHub API ${res.status} on ${path}: ${await res.text().catch(() => '')}`
    // What GitHub refused is a recent error for admins (logs and diagnostics), grouped by status and repository.
    void recordError({ origin: 'github', subject: repositoryOf(path), advice: githubAdvice(res.status), detail: error })
    throw new Error(error)
  }
  return res
}
