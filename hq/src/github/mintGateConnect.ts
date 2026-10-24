/**
 * The mint gate for a repository being connected (workflows spec part 4, *Connecting a repository*): there is no
 * connection to read the repository from yet, so the gate takes the place, the person acting and the GitHub account
 * chosen, with the same checks as `mintGate.ts`, and answers GitHub's ids for the connection to store.
 */
import { HttpError } from 'wasp/server'
import type { GitHubPermissions } from '@agenthix/core'
import type { WorkflowPlace } from '../workflows/placeAccess'
import { installationsForPlace, projectDefaultInstallationId, type RuledInstallation } from './connectRule'
import {
  gateDeps, mint, requireInstallationFor, requireOneRepository, requirePermissions, requirePerson,
  type GateDeps, type GateToken,
} from './mintGate'

export type ConnectDeps = GateDeps & {
  candidates(place: WorkflowPlace): Promise<RuledInstallation[]>
  projectDefault(place: WorkflowPlace): Promise<string | null>
}

export const connectDeps: ConnectDeps = { ...gateDeps, candidates: installationsForPlace, projectDefault: projectDefaultInstallationId }

const refuse = (status: number, message: string): never => {
  throw new HttpError(status, `${message} Nothing was changed.`)
}

/**
 * The account a connection uses: the one chosen; else, for an existing repository, the one the place may connect to
 * whose account has the repository's owner as its login (the token is then checked against the account's id); else
 * the project's default; else the only one there is.
 */
export async function chooseConnectInstallation(
  place: WorkflowPlace, choice: { installationRowId?: string | null; ownerLogin?: string | null }, deps: ConnectDeps = connectDeps,
): Promise<RuledInstallation> {
  const candidates = await deps.candidates(place)
  if (choice.installationRowId) {
    const chosen = candidates.find((c) => c.id === choice.installationRowId)
    return chosen ?? refuse(403, 'This place may not connect to that GitHub account; an organisation administrator can add it on the GitHub page.')
  }
  if (choice.ownerLogin) {
    const login = choice.ownerLogin.toLowerCase()
    const byLogin = candidates.filter((c) => c.accountLogin.toLowerCase() === login)
    if (byLogin.length === 1) return byLogin[0]
    return refuse(403, `This place may not connect to the GitHub account ${choice.ownerLogin}; an organisation administrator can allow it and add this place on the GitHub page.`)
  }
  const defaultId = await deps.projectDefault(place)
  const byDefault = defaultId ? candidates.find((c) => c.id === defaultId) : undefined
  if (byDefault) return byDefault
  if (candidates.length === 1) return candidates[0]
  return refuse(409, candidates.length
    ? 'Choose which GitHub account to connect: this place may connect to several.'
    : 'This place may connect to no GitHub account yet; an organisation administrator can allow one on the GitHub page.')
}

export type ConnectingMint = {
  place: WorkflowPlace
  person: string
  installationRowId: string
  /** The repository's name under the account; GitHub answers its id, which the connection then stores. */
  repositoryName: string
  permissions: GitHubPermissions
}

/** A token for an existing repository of the account, while it is being connected. */
export async function mintForConnecting(req: ConnectingMint, deps: GateDeps = gateDeps): Promise<GateToken> {
  const permissions = requirePermissions(req.permissions)
  await requirePerson(req.place, req.person, 'work', deps)
  const inst = await requireInstallationFor(await deps.installation({ id: req.installationRowId }), req.place, deps)
  const t = await mint({ installationId: inst.installationId, permissions, repositoryNames: [req.repositoryName] }, deps)
  const repository = await requireOneRepository(t, inst.accountId, deps)
  return { token: t.token, expiresAt: t.expiresAt, repository, installationId: inst.installationId }
}

export type CreatingMint = { place: WorkflowPlace; person: string; installationRowId: string }

/**
 * A token that creates a repository under the account. No repository exists to scope it to, so it carries
 * `administration: write` alone; the caller ends it as soon as the repository is made.
 */
export async function mintForCreating(
  req: CreatingMint, deps: GateDeps = gateDeps,
): Promise<{ token: string; installation: RuledInstallation & { accountId: number } }> {
  await requirePerson(req.place, req.person, 'work', deps)
  const inst = await requireInstallationFor(await deps.installation({ id: req.installationRowId }), req.place, deps)
  const t = await mint({ installationId: inst.installationId, permissions: requirePermissions({ administration: 'write' }) }, deps)
  return { token: t.token, installation: inst }
}
