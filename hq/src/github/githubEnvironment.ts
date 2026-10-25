/**
 * The GitHub Environment `set-github-secrets` sets its secrets on (workflows spec part 4, *Secrets for GitHub Actions
 * are kept from code the agent pushes*): its deployment branches must be protected branches only, so its secrets
 * reach GitHub workflows only on branches that change through a reviewed pull request (V7). HQ checks it when the
 * run starts, through the mint gate, and creates it that way when it doesn't exist yet. One that exists with another
 * policy is the repository's own setting: HQ refuses rather than change it.
 */
import { HttpError } from 'wasp/server'
import { locationApiDeps, withLocationApi, type GitHubLocation, type LocationApiDeps } from './protectedBranches'

type EnvironmentAnswer = { deployment_branch_policy?: { protected_branches?: boolean; custom_branch_policies?: boolean } | null }

export type EnvironmentCheck = 'ready' | 'created'

const refuse = (status: number, message: string): never => {
  throw new HttpError(status, `${message} Nothing was changed.`)
}

/** Whether the environment admits only protected branches. */
export function onlyProtectedBranches(env: EnvironmentAnswer): boolean {
  const p = env.deployment_branch_policy
  return !!p && p.protected_branches === true && p.custom_branch_policies !== true
}

export async function ensureProtectedEnvironment(
  loc: GitHubLocation, environment: string, deps: LocationApiDeps = locationApiDeps,
): Promise<EnvironmentCheck> {
  const path = `/environments/${encodeURIComponent(environment)}`
  const found = await withLocationApi(loc, { actions: 'read' }, async (api) => {
    const res = await api.call(path)
    if (res.status === 404) return { repository: api.repository, env: null }
    if (!res.ok) return refuse(502, `HQ couldn't read the ${environment} environment of ${api.repository} from GitHub (${res.status}).`)
    return { repository: api.repository, env: (await res.json()) as EnvironmentAnswer }
  }, deps)
  if (found.env) {
    if (onlyProtectedBranches(found.env)) return 'ready'
    return refuse(409, `The ${environment} environment of ${found.repository} lets branches other than protected ones deploy, so its secrets could reach code the agent pushes. A repository administrator sets its Deployment branches to Protected branches only in the repository's settings on GitHub, then runs this again.`)
  }
  await withLocationApi(loc, { administration: 'write' }, async (api) => {
    const res = await api.call(path, {
      method: 'PUT',
      body: JSON.stringify({ deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }),
    })
    if (!res.ok) refuse(502, `HQ couldn't create the ${environment} environment on ${api.repository} (${res.status}); it needs the App's Administration: write on the repository.`)
    const made = (await res.json()) as EnvironmentAnswer
    if (!onlyProtectedBranches(made)) refuse(502, `GitHub made the ${environment} environment on ${api.repository} without limiting it to protected branches; a repository administrator sets that in the repository's settings.`)
  }, deps)
  return 'created'
}
