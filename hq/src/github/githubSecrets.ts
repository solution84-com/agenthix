/**
 * The secrets a location's repository holds on GitHub, by name only (workflows spec part 4, *Secrets for GitHub
 * Actions are kept from code the agent pushes*). HQ sets secrets on GitHub only through the place's approved
 * `set-github-secrets`, as secrets of one environment whose deployment branches are protected branches only; there
 * is no other way to send one there. Everything else on GitHub is listed as *Outside hq*: every repository secret,
 * which any GitHub workflow on a push or a pull request can read, so code the agent pushes can reach it; and any
 * environment secret the approved version doesn't name.
 */
import { prisma } from 'wasp/server'
import { githubFetch } from './githubClient'
import { withRepoApi } from './repoApi'
import type { RepoTarget } from '../storage/repoAttachmentService'
import { GITHUB_SECRETS_ENVIRONMENT } from '../workflows/starters/definitions'

export type GitHubSecretItem = {
  name: string
  updatedAt: string
  /** Null for a repository secret. */
  environment: string | null
  /** Set by the place's approved `set-github-secrets`; false is *Outside hq*. */
  fromHq: boolean
  /** Why a secret outside HQ matters, for the screen; null for one HQ set. */
  note: string | null
}

export const REPOSITORY_SECRET_NOTE = 'Outside HQ: a repository secret reaches any GitHub workflow that runs on a push or a pull request, so code an agent pushes can reach it.'
export const ENVIRONMENT_SECRET_NOTE = 'Outside HQ: set on GitHub some other way, not by this place\'s approved set-github-secrets.'

type Listed = { secrets?: Array<{ name: string; updated_at: string }> }

/** The names the place's approved `set-github-secrets` sets. */
async function namesSetByHq(target: RepoTarget): Promise<Set<string>> {
  const v = await prisma.workflowVersion.findFirst({
    where: { state: 'APPROVED', workflow: { placeType: target.ownerType, placeId: target.ownerId, name: 'set-github-secrets', enabled: true } },
    select: { githubSecretNames: true },
  })
  return new Set(v?.githubSecretNames ?? [])
}

export function markSecrets(repository: Listed, environment: Listed | null, setByHq: Set<string>): GitHubSecretItem[] {
  const repo = (repository.secrets ?? []).map((s) => ({
    name: s.name, updatedAt: s.updated_at, environment: null, fromHq: false, note: REPOSITORY_SECRET_NOTE,
  }))
  const env = (environment?.secrets ?? []).map((s) => {
    const fromHq = setByHq.has(s.name)
    return { name: s.name, updatedAt: s.updated_at, environment: GITHUB_SECRETS_ENVIRONMENT, fromHq, note: fromHq ? null : ENVIRONMENT_SECRET_NOTE }
  })
  return [...env, ...repo]
}

/** The repository's and the environment's secrets, by name; GitHub never returns a value. */
export async function listGitHubSecrets(target: RepoTarget, userId: string): Promise<GitHubSecretItem[]> {
  const setByHq = await namesSetByHq(target)
  return withRepoApi({ target, userId, needs: 'read', permissions: { secrets: 'read', environments: 'read' } }, async ({ owner, repo, token }) => {
    const repository = (await (await githubFetch(token, `/repos/${owner}/${repo}/actions/secrets`)).json()) as Listed
    let environment: Listed | null = null
    const env = await fetch(`https://api.github.com/repos/${owner}/${repo}/environments/${encodeURIComponent(GITHUB_SECRETS_ENVIRONMENT)}/secrets`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    // No such environment yet: nothing set there.
    if (env.ok) environment = (await env.json()) as Listed
    else if (env.status !== 404) throw new Error(`GitHub API ${env.status} on the ${GITHUB_SECRETS_ENVIRONMENT} environment's secrets`)
    return markSecrets(repository, environment, setByHq)
  })
}
