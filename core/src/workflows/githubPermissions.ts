/**
 * The GitHub permissions a workflow declares under `github:` (spec part 4, *Permissions*). Each run's
 * `GITHUB_TOKEN` is minted with exactly these, for one repository, so only a repository's permissions mean anything
 * here; the names are the ones GitHub's API takes when an installation token is asked for.
 */
export const GITHUB_REPOSITORY_PERMISSIONS = [
  'actions', 'administration', 'checks', 'contents', 'deployments', 'environments', 'issues', 'metadata',
  'packages', 'pages', 'pull_requests', 'repository_hooks', 'repository_projects', 'secret_scanning_alerts',
  'secrets', 'security_events', 'statuses', 'variables', 'vulnerability_alerts', 'workflows',
] as const
export type GitHubRepositoryPermission = (typeof GITHUB_REPOSITORY_PERMISSIONS)[number]

export const GITHUB_PERMISSION_LEVELS = ['read', 'write'] as const
export type GitHubPermissionLevel = (typeof GITHUB_PERMISSION_LEVELS)[number]

export type GitHubPermissions = Partial<Record<GitHubRepositoryPermission, GitHubPermissionLevel>>

/** GitHub grants these only to read. */
export const GITHUB_READ_ONLY_PERMISSIONS: readonly GitHubRepositoryPermission[] = ['metadata']

/**
 * What a person may approve in their own storage without an organisation administrator (spec part 1, R4): contents
 * and pull requests, and metadata, which GitHub grants with any of them.
 */
export const OWN_STORAGE_GITHUB_PERMISSIONS: readonly GitHubRepositoryPermission[] = ['contents', 'pull_requests', 'metadata']

export function isGitHubRepositoryPermission(name: string): name is GitHubRepositoryPermission {
  return (GITHUB_REPOSITORY_PERMISSIONS as readonly string[]).includes(name)
}

/** The permissions in `wanted` that `granted` doesn't cover (`write` covers `read`). */
export function permissionsBeyond(wanted: GitHubPermissions, granted: GitHubPermissions): GitHubPermissions {
  const beyond: GitHubPermissions = {}
  for (const [name, level] of Object.entries(wanted) as [GitHubRepositoryPermission, GitHubPermissionLevel][]) {
    const has = granted[name]
    if (has === 'write' || has === level) continue
    beyond[name] = level
  }
  return beyond
}
