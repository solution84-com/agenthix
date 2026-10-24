/** Words for the GitHub screens (workflows spec part 5, G1–G3): permissions, reach, rules and ages. */
import { permissionsBeyond, type GitHubPermissionLevel, type GitHubPermissions, type GitHubRepositoryPermission } from '@agenthix/core'

const PERMISSION_LABELS: Partial<Record<GitHubRepositoryPermission, string>> = {
  contents: 'Code',
  pull_requests: 'Pull requests',
  administration: 'Administration',
  environments: 'Environments',
  workflows: 'Workflows',
  metadata: 'Metadata',
}

/** What uses each permission today: the starter workflows, and the things hq itself does. */
const PERMISSION_USES: Partial<Record<GitHubRepositoryPermission, string>> = {
  contents: 'push, pull',
  pull_requests: 'open-pull-request',
  environments: 'set-github-secrets',
  workflows: 'pushing a GitHub workflow file',
  administration: 'creating a repository for a workspace',
  metadata: 'every run (GitHub always grants it)',
}

const NOT_USED_YET = 'no starter workflow; a workflow you approve can ask for it'

export function permissionLabel(name: string): string {
  const known = PERMISSION_LABELS[name as GitHubRepositoryPermission]
  if (known) return known
  const spaced = name.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const permissionUse = (name: string): string => PERMISSION_USES[name as GitHubRepositoryPermission] ?? NOT_USED_YET

export function permissionLine(name: string, level: GitHubPermissionLevel): string {
  return `${permissionLabel(name)}: ${level}`
}

/** The App's permissions as rows, in a steady order (those with a use first). */
export function permissionRows(app: GitHubPermissions): { name: string; level: GitHubPermissionLevel; label: string; use: string }[] {
  return (Object.entries(app) as [string, GitHubPermissionLevel][])
    .map(([name, level]) => ({ name, level, label: permissionLine(name, level), use: permissionUse(name) }))
    .sort((a, b) => Number(b.use !== NOT_USED_YET) - Number(a.use !== NOT_USED_YET) || a.name.localeCompare(b.name))
}

/** Whether an account has accepted the App's latest permissions; when not, which it hasn't. */
export function acceptance(app: GitHubPermissions | null, accepted: GitHubPermissions | null): { current: boolean; unknown: boolean; missing: string[] } {
  if (!app || !accepted) return { current: false, unknown: true, missing: [] }
  const beyond = permissionsBeyond(app, accepted)
  const missing = (Object.entries(beyond) as [string, GitHubPermissionLevel][]).map(([n, l]) => permissionLine(n, l))
  return { current: missing.length === 0, unknown: false, missing }
}

export type AccountRow = {
  id: string
  installationId: number
  login: string
  type: string
  state: string
  projectRule: string
  projectIds: string[]
  userIds: string[]
  reach: { selection: 'all' | 'selected' | 'unknown'; canCreateRepository: boolean; words: string }
}

export const accountKind = (type: string): string => (type === 'Organization' ? 'organisation' : 'personal account')

/** What an account can reach, in the table's words. */
export function reachWords(a: AccountRow): string {
  if (a.reach.selection === 'all') return 'All repositories'
  if (a.reach.selection === 'selected') return 'Selected repositories only'
  return 'Not known yet'
}

/** Why an account cannot create a repository, or null when it can (or its reach is not known yet). */
export function cannotCreateWords(a: AccountRow): string | null {
  if (a.reach.canCreateRepository || a.reach.selection === 'unknown') return null
  if (a.type !== 'Organization') return "GitHub doesn't let an App create repositories in a personal account"
  if (a.reach.selection === 'selected') return "Can't create new repositories"
  return 'Has not accepted the permission to create repositories'
}

/** Which projects and people may connect to an account, in words. */
export function ruleWords(a: AccountRow, projectNames: Map<string, string>, personNames: Map<string, string>): string {
  if (a.projectRule === 'EVERY_PROJECT' && a.userIds.length === 0) return 'Every project'
  const projects = a.projectIds.map((id) => projectNames.get(id) ?? 'A project')
  const people = a.userIds.map((id) => `${personNames.get(id) ?? 'A person'}'s own work`)
  const parts = a.projectRule === 'EVERY_PROJECT' ? ['Every project', ...people] : [...projects, ...people]
  if (parts.length === 0) return 'No project yet'
  return a.projectRule === 'EVERY_PROJECT' ? parts.join(', ') : `Only: ${parts.join(', ')}`
}

export function agoWords(at: Date | string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.round(hours / 24)} days ago`
}

export const POLL_WORDS = 'Waiting for GitHub…'

export const CEILING_WORDS =
  'This is the ceiling. Each run gets a token with only what its workflow declares, below it, for its workspace\'s repository only, revoked when the run ends.'
