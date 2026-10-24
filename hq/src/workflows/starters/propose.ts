/**
 * Proposing the starter workflows (workflows spec part 4): when a repository is connected, `push`, `pull` and
 * `open-pull-request` are proposed at once, so the administrator who connected it can approve them in the same
 * sitting; `set-github-secrets` is proposed when an administrator first asks for a secret to be set on GitHub
 * (*Also set it on GitHub*), and again with each further name. Each goes through the library's `storeVersion` with
 * origin `STARTER`, and is checked, reviewed and approved like any other version. A proposal approves nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import { validateStoredSecretName, type WorkflowRunWorkspace } from '@agenthix/core'
import { resolveStorageSite } from '../../storage/storageSite'
import { executorImageForSite } from '../executorImage'
import type { WorkflowPlace } from '../placeAccess'
import { listPlaceSecretNames } from '../placeNames'
import { storeVersion } from '../propose'
import { starterContent } from './content'
import { STARTERS_AT_CONNECT, setGitHubSecretsSource, starterSource, type StarterName } from './definitions'

export type StarterProposal =
  | { workflow: StarterName; proposed: true; version: number }
  /** The same version is already approved, declined or replaced: nothing new to propose. */
  | { workflow: StarterName; proposed: false; message: string }

export type StarterDeps = {
  digestFor(place: WorkflowPlace, workspace: WorkflowRunWorkspace | null): Promise<string>
  store: typeof storeVersion
}

const defaultDeps: StarterDeps = {
  async digestFor(place, workspace) {
    const siteId = await resolveStorageSite({ ownerType: place.type, ownerId: place.id, workspaceId: workspace?.workspaceId ?? undefined })
    return (await executorImageForSite(siteId)).digest
  },
  store: storeVersion,
}

async function storeStarter(
  place: WorkflowPlace, name: StarterName, run: () => Promise<{ version: number }>,
): Promise<StarterProposal> {
  try {
    return { workflow: name, proposed: true, version: (await run()).version }
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 409) return { workflow: name, proposed: false, message: err.message }
    throw err
  }
}

/** Proposes the starters for a place whose workspace was just connected to a GitHub repository. 4c calls it. */
export async function proposeStarters(
  place: WorkflowPlace, workspace: WorkflowRunWorkspace, deps: StarterDeps = defaultDeps,
): Promise<StarterProposal[]> {
  if (workspace.ownerType !== place.type || workspace.ownerId !== place.id) {
    throw new HttpError(400, 'The starter workflows are proposed for a workspace of their own place. Nothing was changed.')
  }
  const digest = await deps.digestFor(place, workspace)
  const out: StarterProposal[] = []
  for (const name of STARTERS_AT_CONNECT) {
    const proposal = await starterContent(starterSource(name), digest)
    out.push(await storeStarter(place, name, () => deps.store(place, proposal, { kind: 'starter' })))
  }
  return out
}

/** The names the place's `set-github-secrets` sets: its approved version's and its newest waiting one's. */
async function currentGitHubSecretNames(place: WorkflowPlace): Promise<string[]> {
  const versions = await prisma.workflowVersion.findMany({
    where: { workflow: { placeType: place.type, placeId: place.id, name: 'set-github-secrets' }, state: { in: ['APPROVED', 'PROPOSED'] } },
    orderBy: { number: 'desc' },
    select: { state: true, githubSecretNames: true },
  })
  const approved = versions.find((v) => v.state === 'APPROVED')
  const waiting = versions.find((v) => v.state === 'PROPOSED')
  return [...new Set([...(approved?.githubSecretNames ?? []), ...(waiting?.githubSecretNames ?? [])])]
}

/**
 * *Also set it on GitHub* (spec part 3, *Adding a secret*): proposes the place's `set-github-secrets` with `name`
 * added to the names it sets, for an administrator to approve next. Names the place no longer has are left out.
 */
export async function proposeGitHubSecretName(
  place: WorkflowPlace, name: string, deps: StarterDeps = defaultDeps,
): Promise<StarterProposal> {
  const valid = validateStoredSecretName(name)
  if (!valid.ok) throw new HttpError(400, `${valid.reason} Nothing was changed.`)
  // GitHub refuses a secret name that starts with GITHUB_.
  if (name.startsWith('GITHUB_')) throw new HttpError(400, `GitHub doesn't take a secret named ${name}: its names can't start with GITHUB_. Nothing was changed.`)
  const have = new Set(await listPlaceSecretNames(place))
  if (!have.has(name)) throw new HttpError(404, `This place has no secret ${name} to set on GitHub; add it first. Nothing was changed.`)
  const names = [...new Set([...(await currentGitHubSecretNames(place)), name])].filter((n) => have.has(n)).sort()
  const source = setGitHubSecretsSource(names)!
  const proposal = await starterContent(source, await deps.digestFor(place, null), names)
  return storeStarter(place, 'set-github-secrets', () => deps.store(place, proposal, { kind: 'starter' }))
}
