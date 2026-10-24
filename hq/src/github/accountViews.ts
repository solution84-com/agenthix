/** What the GitHub screens show about the accounts (workflows spec part 4): reach, rule, what each has accepted. */
import { prisma } from 'wasp/server'
import type { GitHubPermissions } from '@agenthix/core'
import { installationsForPlace, projectDefaultInstallationId, type RuledInstallation } from './connectRule'
import { recalledFacts } from './permissionFacts'
import type { WorkflowPlace } from '../workflows/placeAccess'

/** The pages poll at this pace after GitHub sends the person back (instead of a Refresh button). */
export const GITHUB_POLL = { everyMs: 4_000, forMs: 60_000 } as const

export type AccountReach = {
  selection: 'all' | 'selected' | 'unknown'
  /** What it can do: create a repository (an organisation on all repositories that accepted administration), or link only. */
  canCreateRepository: boolean
  words: string
}

export function reachOf(i: Pick<RuledInstallation, 'repositorySelection' | 'accountType'>, accepted: GitHubPermissions | undefined): AccountReach {
  const selection = i.repositorySelection === 'all' || i.repositorySelection === 'selected' ? i.repositorySelection : 'unknown'
  const canCreateRepository = selection === 'all' && i.accountType === 'Organization' && (accepted ? accepted.administration === 'write' : true)
  const reaches = selection === 'all' ? 'All repositories' : selection === 'selected' ? 'Selected repositories only' : 'Reach not known yet'
  return {
    selection, canCreateRepository,
    words: `${reaches}; ${canCreateRepository ? 'can create a repository or link one' : 'can link an existing repository only'}.`,
  }
}

export async function accountList() {
  const rows = await prisma.gitHubInstallation.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, installationId: true, accountLogin: true, accountType: true, repositorySelection: true, state: true, projectRule: true, decidedAt: true,
      projects: { select: { projectId: true } }, people: { select: { userId: true } } },
  })
  const accepted = recalledFacts().accounts
  return rows.map((r) => ({
    id: r.id, installationId: r.installationId, login: r.accountLogin, type: r.accountType, state: r.state,
    projectRule: r.projectRule, projectIds: r.projects.map((p) => p.projectId), userIds: r.people.map((p) => p.userId),
    decidedAt: r.decidedAt,
    acceptedPermissions: accepted.get(r.installationId) ?? null,
    reach: reachOf({ repositorySelection: r.repositorySelection, accountType: r.accountType }, accepted.get(r.installationId)),
  }))
}

/** The accounts a place may connect to now, and its default. */
export async function accountsForPlace(place: WorkflowPlace) {
  const accepted = recalledFacts().accounts
  const accounts = (await installationsForPlace(place)).map((i) => ({
    id: i.id, login: i.accountLogin, type: i.accountType, reach: reachOf(i, accepted.get(i.installationId)),
  }))
  return { accounts, defaultId: await projectDefaultInstallationId(place) }
}
