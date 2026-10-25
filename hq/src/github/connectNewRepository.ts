/**
 * Creating a repository for a connection, and undoing it when a later step fails (workflows spec part 4,
 * *Connecting a repository*): the repository hq just created is deleted and that is said; if it can't be, it is recorded
 * and named in the answer.
 */
import { createGitHubRepo, type CreatedRepository } from '../storage/github'
import { mintForCreating } from './mintGateConnect'
import { revokeGateToken } from './mintGate'
import { deleteGitHubRepository } from './createdRepository'
import { recordError } from '../diagnostics/recordedErrors'
import type { Advice } from '../diagnostics/errorAdvice'
import type { WorkflowPlace } from '../workflows/placeAccess'

export type NewRepositoryDeps = {
  mintForCreating: typeof mintForCreating
  create: typeof createGitHubRepo
  remove: typeof deleteGitHubRepository
  revoke(token: string): Promise<unknown>
  record: typeof recordError
}

export const newRepositoryDeps: NewRepositoryDeps = {
  mintForCreating, create: createGitHubRepo, remove: deleteGitHubRepository,
  revoke: (t) => revokeGateToken(t).catch(() => false), record: recordError,
}

type Account = { place: WorkflowPlace; person: string; installationRowId: string; login: string }

/** Creates the repository with a token that ends as soon as GitHub has answered. */
export async function createRepositoryFor(a: Account, name: string, description: string, deps: NewRepositoryDeps = newRepositoryDeps): Promise<CreatedRepository> {
  const creating = await deps.mintForCreating({ place: a.place, person: a.person, installationRowId: a.installationRowId })
  try {
    return await deps.create(creating.token, a.login, name, description)
  } finally {
    await deps.revoke(creating.token)
  }
}

const LEFT_BEHIND: Advice = {
  kind: 'github-repository-left-behind',
  title: 'A repository created for a connection could not be deleted',
  advice: 'Delete it on GitHub, or connect it here as an existing repository.',
}

/**
 * Deletes a repository hq created whose connection then failed. Answers the sentence to append to the failure: what
 * happened to the repository, named either way.
 */
export async function undoCreatedRepository(a: Account, name: string, deps: NewRepositoryDeps = newRepositoryDeps): Promise<string> {
  const full = `${a.login}/${name}`
  let removed = false
  let why = 'GitHub did not allow it'
  try {
    const t = await deps.mintForCreating({ place: a.place, person: a.person, installationRowId: a.installationRowId })
    try {
      removed = await deps.remove(t.token, a.login, name)
    } finally {
      await deps.revoke(t.token)
    }
  } catch (err) {
    why = err instanceof Error ? err.message : why
  }
  if (removed) return `The repository ${full}, which had just been created, was deleted again.`
  await deps.record({ origin: 'github', subject: full, advice: LEFT_BEHIND, detail: `${full} was created for a connection that then failed, and could not be deleted: ${why}` })
    .catch(() => undefined)
  return `The repository ${full}, which had just been created, could not be deleted (${why}) and is still on GitHub: delete it there, or connect it here as an existing repository.`
}
