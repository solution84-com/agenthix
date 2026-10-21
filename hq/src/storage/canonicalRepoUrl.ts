/**
 * The one form a linked repo's URL is stored in and compared by:
 * `https://github.com/<owner>/<name>` (spec §4.26). Rows linked before that rule
 * hold whatever the person pasted — http://, www., a trailing slash, an SSH form —
 * so anything that reads a stored URL back goes through this rather than trusting it.
 *
 * Only github.com (or www.github.com) parses; nothing that carries a user, a port,
 * a query or a path beyond owner/name does. site/src/server/storage/canonicalRepoUrl.ts
 * is the same helper — the two apps do not import from each other.
 */
const FORMS = /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i

export function canonicalGitHubRepoUrl(raw: string): string | null {
  const m = FORMS.exec(raw.trim())
  if (!m || m[2] === '.' || m[2] === '..') return null
  return `https://github.com/${m[1]}/${m[2]}`
}
