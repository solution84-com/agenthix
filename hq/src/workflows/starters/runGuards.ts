/**
 * What hq reads from GitHub before a starter workflow's run is sent (workflows spec part 4, *Secrets for GitHub
 * Actions are kept from code the agent pushes*), after the run checks and before any token for the run is minted:
 * `push` and `open-pull-request` refuse a protected target branch; `set-github-secrets` sets secrets only on an
 * environment whose deployment branches are protected branches only, and makes it so when it is new.
 *
 * Keyed by the workflow's name in its place, whatever made the version: an agent's own version of `push` is held to
 * the same rule as the shipped one.
 */
import { ensureProtectedEnvironment } from '../../github/githubEnvironment'
import { refuseProtectedBranch, type GitHubLocation } from '../../github/protectedBranches'
import { GITHUB_SECRETS_ENVIRONMENT, PROTECTED_TARGET_PARAMETER, type StarterName } from './definitions'

export type StarterRunGuard = {
  workflowName: string
  /** The run's parameters, as the run checks left them. */
  parameters: Record<string, string>
  location: GitHubLocation
}

export type StarterGuardDeps = {
  refuseProtectedBranch: typeof refuseProtectedBranch
  ensureProtectedEnvironment: typeof ensureProtectedEnvironment
}
const defaultDeps: StarterGuardDeps = { refuseProtectedBranch, ensureProtectedEnvironment }

export async function guardStarterRun(g: StarterRunGuard, deps: StarterGuardDeps = defaultDeps): Promise<void> {
  const target = PROTECTED_TARGET_PARAMETER[g.workflowName as StarterName]
  if (target) {
    const branch = g.parameters[target]
    if (branch !== undefined) await deps.refuseProtectedBranch(g.location, g.workflowName, branch)
    return
  }
  if (g.workflowName === 'set-github-secrets') {
    await deps.ensureProtectedEnvironment(g.location, g.parameters.environment ?? GITHUB_SECRETS_ENVIRONMENT)
  }
}
