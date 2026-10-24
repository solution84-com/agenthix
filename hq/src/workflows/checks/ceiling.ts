/**
 * The GitHub App's permissions and the repository's GitHub account's accepted ones (spec part 4, *the ceiling*),
 * for R1 rule 6. hq doesn't read them from GitHub yet, so this answers unknown and the rule flags nothing for it.
 */
import type { WorkflowPlace } from '../placeAccess'
import type { GitHubCeiling } from './flag'

export async function githubCeilingFor(_place: WorkflowPlace): Promise<GitHubCeiling> {
  return { known: false }
}
