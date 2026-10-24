/**
 * The GitHub App's permissions and the repository's GitHub account's accepted ones (spec part 4, *the ceiling*), for
 * R1 rule 6. The account is the one the place connects to: the project's default when it may, else what every account
 * the place may connect to has accepted. Unknown when no App is registered or GitHub can't be reached; then rule 6
 * flags nothing for it, and the mint itself still refuses what GitHub won't grant.
 */
import type { WorkflowPlace } from '../placeAccess'
import type { GitHubCeiling } from './flag'
import { currentFacts } from '../../github/githubFacts'
import { installationsForPlace, projectDefaultInstallationId } from '../../github/connectRule'
import { commonPermissions } from '../../github/permissionFacts'

export async function githubCeilingFor(place: WorkflowPlace): Promise<GitHubCeiling> {
  const facts = await currentFacts()
  if (!facts?.app) return { known: false }
  const candidates = await installationsForPlace(place)
  const preferred = await projectDefaultInstallationId(place)
  const chosen = candidates.filter((c) => c.id === preferred)
  const accounts = (chosen.length ? chosen : candidates)
    .map((c) => facts.accounts.get(c.installationId))
    .filter((p): p is NonNullable<typeof p> => !!p)
  return { known: true, app: facts.app, account: accounts.length ? commonPermissions(accounts) : facts.app }
}
