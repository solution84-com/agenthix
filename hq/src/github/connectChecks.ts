/**
 * What is checked before a repository is connected or created (workflows spec part 4, *Connecting a repository*):
 * which GitHub account, whether it can take a new repository, and whether the name is free. Nothing here creates
 * anything. A refusal says what is wrong, who holds it and what to do, and ends "Nothing was changed.".
 */
import { HttpError } from 'wasp/server'
import type { WorkflowPlace } from '../workflows/placeAccess'
import { chooseConnectInstallation, mintForConnecting, mintForCreating } from './mintGateConnect'
import { revokeGateToken } from './mintGate'
import { reachOf } from './accountViews'
import { recalledFacts } from './permissionFacts'
import { parseRepo, toRepoSlug } from '../storage/github'
import { findGitHubRepository } from './createdRepository'
import type { RuledInstallation } from './connectRule'

export type ConnectProblemKind =
  | 'choose_account' | 'account_not_allowed' | 'personal_account' | 'selected_repositories' | 'no_administration'
  | 'bad_name' | 'name_taken' | 'not_found'

export type ConnectProblem = { kind: ConnectProblemKind; words: string }

export type ConnectCheck = {
  ok: boolean
  account: { id: string; login: string } | null
  problem: ConnectProblem | null
  /** Set when a new repository's name is taken: connecting this one instead is offered. */
  useExisting: { repoUrl: string } | null
}

export type ConnectAsk = {
  place: WorkflowPlace
  person: string
  /** A new repository (`name`), or an existing one (`repoUrl`, or `name` under the account). */
  kind: 'new' | 'existing'
  name?: string | null
  repoUrl?: string | null
  installationRowId?: string | null
}

export type CheckDeps = {
  choose: typeof chooseConnectInstallation
  repositoryExists: typeof findGitHubRepository
  mintForCreating: typeof mintForCreating
  mintForConnecting: typeof mintForConnecting
  revoke(token: string): Promise<unknown>
  accepted(installationId: number): Parameters<typeof reachOf>[1]
}

export const checkDeps: CheckDeps = {
  choose: chooseConnectInstallation,
  repositoryExists: findGitHubRepository,
  mintForCreating,
  mintForConnecting,
  revoke: (t) => revokeGateToken(t).catch(() => false),
  accepted: (id) => recalledFacts().accounts.get(id),
}

const SELECTED_FIX =
  'In that account\'s GitHub App settings on GitHub, set Repository access to All repositories. Or create the repository ' +
  'on GitHub, add it to the selection there, and connect it here as an existing repository. Only an owner of that ' +
  'GitHub account can change this.'

/** Why this account can't take a new repository, with what to do about it; null when it can. */
export function cannotCreateWords(inst: RuledInstallation, accepted: Parameters<typeof reachOf>[1]): ConnectProblem | null {
  const reach = reachOf(inst, accepted)
  if (reach.canCreateRepository) return null
  const who = inst.accountLogin
  if (inst.accountType !== 'Organization') {
    return { kind: 'personal_account', words: `GitHub does not let an app create a repository under a personal account (${who}). Create it on GitHub and connect it here as an existing repository. Nothing was changed.` }
  }
  if (reach.selection !== 'all') {
    return { kind: 'selected_repositories', words: `${who} gives the App only the repositories selected on GitHub, and a repository the App creates is not one of them. ${SELECTED_FIX} Nothing was changed.` }
  }
  return { kind: 'no_administration', words: `${who} has not accepted the App's permission to create repositories. An owner of that GitHub account can accept it in the account's GitHub App settings on GitHub. Nothing was changed.` }
}

/** GitHub's rule for a repository name, after hq's own tidying. */
export function repositoryNameProblem(slug: string): string | null {
  if (!slug) return 'A repository needs a name.'
  if (slug.length > 100) return 'A repository name can have at most 100 characters.'
  return null
}

const problem = (kind: ConnectProblemKind, words: string): ConnectProblem => ({ kind, words: `${words} Nothing was changed.` })
const none = (account: ConnectCheck['account'], p: ConnectProblem | null, useExisting: ConnectCheck['useExisting'] = null): ConnectCheck =>
  ({ ok: p === null, account, problem: p, useExisting })

/**
 * Checks without creating anything. Reading whether a name is free needs a token: the one for creating (administration
 * only), ended as soon as GitHub has answered. An existing repository is checked with the read token it would be
 * connected with.
 */
export async function checkConnect(ask: ConnectAsk, deps: CheckDeps = checkDeps): Promise<ConnectCheck> {
  let inst: RuledInstallation
  try {
    const owner = ask.kind === 'existing' && ask.repoUrl?.trim() ? parseRepo(ask.repoUrl.trim()).owner : null
    inst = await deps.choose(ask.place, { installationRowId: ask.installationRowId, ownerLogin: owner })
  } catch (err) {
    if (!(err instanceof HttpError)) return none(null, problem('bad_name', err instanceof Error ? err.message : 'That is not a GitHub repository address.'))
    const kind = err.statusCode === 409 ? 'choose_account' : 'account_not_allowed'
    return none(null, { kind, words: err.message })
  }
  const account = { id: inst.id, login: inst.accountLogin }

  if (ask.kind === 'existing') return checkExisting(ask, inst, account, deps)

  const cannot = cannotCreateWords(inst, deps.accepted(inst.installationId))
  if (cannot) return none(account, cannot)
  const slug = toRepoSlug(ask.name ?? '')
  const badName = repositoryNameProblem(slug)
  if (badName) return none(account, problem('bad_name', badName))

  const creating = await deps.mintForCreating({ place: ask.place, person: ask.person, installationRowId: inst.id })
  try {
    const found = await deps.repositoryExists(creating.token, inst.accountLogin, slug)
    if (found) {
      return none(account, problem('name_taken', `${inst.accountLogin}/${slug} already exists on GitHub. Choose another name, or use the existing one.`), { repoUrl: found.repoUrl })
    }
  } finally {
    await deps.revoke(creating.token)
  }
  return none(account, null)
}

async function checkExisting(ask: ConnectAsk, inst: RuledInstallation, account: ConnectCheck['account'], deps: CheckDeps): Promise<ConnectCheck> {
  let name: string
  try {
    name = ask.repoUrl?.trim() ? parseRepo(ask.repoUrl.trim()).name : (ask.name ?? '').trim()
  } catch (err) {
    return none(account, problem('bad_name', err instanceof Error ? err.message : 'That is not a GitHub repository address.'))
  }
  const badName = repositoryNameProblem(name)
  if (badName) return none(account, problem('bad_name', badName))
  try {
    const t = await deps.mintForConnecting({
      place: ask.place, person: ask.person, installationRowId: inst.id, repositoryName: name, permissions: { contents: 'read' },
    })
    await deps.revoke(t.token)
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 403) throw err
    return none(account, problem('not_found',
      `${inst.accountLogin}/${name} was not found among the repositories this GitHub account gives the App. ` +
      'If it exists, an owner of the account can add it to the selection in the account\'s GitHub App settings on GitHub.'))
  }
  return none(account, null)
}
