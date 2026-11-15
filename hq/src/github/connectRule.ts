/**
 * Which places may connect to a GitHub account (workflows spec part 4, *Several GitHub accounts*): an installation an
 * organisation administrator allowed, whose rule still includes the place. Asked at every mint, so narrowing the rule
 * takes effect at once.
 */
import { prisma } from 'wasp/server'
import type { WorkflowPlace } from '../workflows/placeAccess'

export type InstallationForRule = {
  state: 'WANTS_TO_CONNECT' | 'ALLOWED' | 'IGNORED'
  projectRule: 'EVERY_PROJECT' | 'CHOSEN_PROJECTS'
  projectIds: string[]
  userIds: string[]
}

/** A personal project's owner, or null for a shared project. A project that can't be found has an owner of null. */
export type PersonalProject = { ownerId: string | null } | null

/**
 * A person's own work — their own storage and their personal projects, which only they administer — is never part of
 * *Every project*: it is included only when that person was chosen, so one person's choice never reaches another's.
 */
export function ruleIncludesPlace(inst: InstallationForRule, place: WorkflowPlace, personal: PersonalProject): boolean {
  if (inst.state !== 'ALLOWED') return false
  if (place.type === 'user') return inst.userIds.includes(place.id)
  if (personal) return personal.ownerId !== null && inst.userIds.includes(personal.ownerId)
  return inst.projectRule === 'EVERY_PROJECT' || inst.projectIds.includes(place.id)
}

const INSTALLATION_SELECT = {
  id: true, installationId: true, accountId: true, accountLogin: true, accountType: true, repositorySelection: true,
  state: true, projectRule: true,
  projects: { select: { projectId: true } },
  people: { select: { userId: true } },
} as const

export type RuledInstallation = {
  id: string
  installationId: number
  accountId: number
  accountLogin: string
  accountType: string
  repositorySelection: string | null
  rule: InstallationForRule
}

type InstallationRow = NonNullable<Awaited<ReturnType<typeof findOne>>>

function findOne(where: { installationId: number } | { id: string }) {
  return prisma.gitHubInstallation.findUnique({ where, select: INSTALLATION_SELECT })
}

function toRuled(row: InstallationRow): RuledInstallation {
  return {
    id: row.id,
    installationId: row.installationId,
    accountId: Number(row.accountId),
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    repositorySelection: row.repositorySelection,
    rule: {
      state: row.state,
      projectRule: row.projectRule,
      projectIds: row.projects.map((p) => p.projectId),
      userIds: row.people.map((p) => p.userId),
    },
  }
}

/** By GitHub's installation id, or by hq's own id for the row. */
export async function findInstallation(where: { installationId: number } | { id: string }): Promise<RuledInstallation | null> {
  const row = await findOne(where)
  return row && toRuled(row)
}

export async function personalProjectOf(place: WorkflowPlace): Promise<PersonalProject> {
  if (place.type !== 'project') return null
  const p = await prisma.project.findUnique({ where: { id: place.id }, select: { personalOwnerId: true } })
  if (!p) return { ownerId: null }
  return p.personalOwnerId === null ? null : { ownerId: p.personalOwnerId }
}

/** The installations the place may connect to now. */
export async function installationsForPlace(place: WorkflowPlace): Promise<RuledInstallation[]> {
  const rows = await prisma.gitHubInstallation.findMany({ where: { state: 'ALLOWED' }, select: INSTALLATION_SELECT, orderBy: { createdAt: 'asc' } })
  const personal = await personalProjectOf(place)
  return rows.map(toRuled).filter((i) => ruleIncludesPlace(i.rule, place, personal))
}

/** The project's default account, when it has one. */
export async function projectDefaultInstallationId(place: WorkflowPlace): Promise<string | null> {
  if (place.type !== 'project') return null
  const p = await prisma.project.findUnique({ where: { id: place.id }, select: { defaultGitHubInstallationId: true } })
  return p?.defaultGitHubInstallationId ?? null
}
