import { HttpError } from 'wasp/server'
import type { StartGithubAppRegistration } from 'wasp/server/operations'
import { requireRole } from '../server/identity/requireRole'
import { requireSecretsKey } from '../server/crypto/requireSecretsKey'
import { getApp, serverUrl } from './githubApp'
import { issueManifestState } from './manifestState'

const WHAT = 'Connecting GitHub'
// A GitHub account or organisation login: letters, digits and single hyphens.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

type StartArgs = { org?: string }

/**
 * Starts a GitHub App registration from inside hq. Only an admin can, and the returned
 * address carries a one-time state that the manifest page and the callback both require.
 */
export const startGithubAppRegistration: StartGithubAppRegistration<StartArgs, { url: string }> = async (args, context) => {
  await requireRole(context, 'ADMIN', WHAT)
  const userId = context.user?.id
  if (!userId) throw new HttpError(401)
  const org = typeof args?.org === 'string' ? args.org.trim() : ''
  if (org && !GITHUB_LOGIN.test(org)) throw new HttpError(400, 'That is not a valid GitHub organisation name')
  if (await getApp()) {
    throw new HttpError(409, 'A GitHub App is already connected. Disconnect it first, then connect again.')
  }
  requireSecretsKey(WHAT)

  const state = issueManifestState(userId)
  const query = new URLSearchParams({ state })
  if (org) query.set('org', org)
  return { url: `${serverUrl()}/api/v1/github/app-manifest-new?${query.toString()}` }
}
