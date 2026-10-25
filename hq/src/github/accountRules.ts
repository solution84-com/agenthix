/**
 * Deciding on a GitHub account (workflows spec part 4, *Several GitHub accounts*): allow or ignore a new
 * installation, and say which places may connect. People are chosen one by one, none by default: a chosen person's own
 * storage and personal projects.
 */
import { HttpError, prisma } from 'wasp/server'
import { ruleIncludesPlace } from './connectRule'

export type AccountRuleInput = {
  projectRule: 'EVERY_PROJECT' | 'CHOSEN_PROJECTS'
  projectIds?: string[]
  userIds?: string[]
}

const unique = (ids: unknown): string[] => (Array.isArray(ids) ? [...new Set(ids.filter((i): i is string => typeof i === 'string'))] : [])

/** Checks the rule's input and returns it clean; a project or person that doesn't exist is refused by name of the problem. */
export async function checkedRule(input: AccountRuleInput): Promise<Required<AccountRuleInput>> {
  if (input?.projectRule !== 'EVERY_PROJECT' && input?.projectRule !== 'CHOSEN_PROJECTS') {
    throw new HttpError(400, 'Choose every project or chosen projects. Nothing was changed.')
  }
  const projectIds = unique(input.projectIds)
  const userIds = unique(input.userIds)
  const projects = await prisma.project.count({ where: { id: { in: projectIds }, personalOwnerId: null } })
  if (projects !== projectIds.length) throw new HttpError(400, 'One of the chosen projects doesn\'t exist or is someone\'s personal project. Nothing was changed.')
  const users = await prisma.user.count({ where: { id: { in: userIds }, deactivatedAt: null } })
  if (users !== userIds.length) throw new HttpError(400, 'One of the chosen people isn\'t an active member. Nothing was changed.')
  return { projectRule: input.projectRule, projectIds, userIds }
}

/** Drops a project's default account when the account no longer admits that project. */
export async function clearStaleDefaults(installationRowId: string): Promise<void> {
  const row = await prisma.gitHubInstallation.findUnique({
    where: { id: installationRowId },
    select: { state: true, projectRule: true, projects: { select: { projectId: true } }, people: { select: { userId: true } } },
  })
  if (!row) return
  const defaults = await prisma.project.findMany({ where: { defaultGitHubInstallationId: installationRowId }, select: { id: true, personalOwnerId: true } })
  const rule = { state: row.state, projectRule: row.projectRule, projectIds: row.projects.map((p) => p.projectId), userIds: row.people.map((p) => p.userId) }
  const stale = defaults.filter((p) => !ruleIncludesPlace(rule, { type: 'project', id: p.id }, p.personalOwnerId === null ? null : { ownerId: p.personalOwnerId })).map((p) => p.id)
  if (stale.length) await prisma.project.updateMany({ where: { id: { in: stale } }, data: { defaultGitHubInstallationId: null } })
}

async function writeRule(id: string, state: 'ALLOWED', by: string, rule: Required<AccountRuleInput>): Promise<void> {
  await prisma.$transaction([
    prisma.gitHubInstallationProject.deleteMany({ where: { installationId: id } }),
    prisma.gitHubInstallationPerson.deleteMany({ where: { installationId: id } }),
    prisma.gitHubInstallation.update({
      where: { id },
      data: {
        state, decidedById: by, decidedAt: new Date(), projectRule: rule.projectRule,
        projects: { create: rule.projectIds.map((projectId) => ({ projectId })) },
        people: { create: rule.userIds.map((userId) => ({ userId })) },
      },
    }),
  ])
  await clearStaleDefaults(id)
}

async function existing(id: string) {
  const row = await prisma.gitHubInstallation.findUnique({ where: { id }, select: { id: true, state: true, accountLogin: true } })
  if (!row) throw new HttpError(404, 'That GitHub account isn\'t connected to HQ any more. Nothing was changed.')
  return row
}

/** Allow a new (or ignored) installation, with the places that may connect. */
export async function allowAccount(id: string, by: string, input: AccountRuleInput): Promise<void> {
  await existing(id)
  await writeRule(id, 'ALLOWED', by, await checkedRule(input))
}

/** Change the places that may connect; only an allowed account has a rule to change. */
export async function changeAccountRule(id: string, by: string, input: AccountRuleInput): Promise<void> {
  const row = await existing(id)
  if (row.state !== 'ALLOWED') throw new HttpError(409, `${row.accountLogin} isn't allowed yet; allow it first. Nothing was changed.`)
  await writeRule(id, 'ALLOWED', by, await checkedRule(input))
}

/** Ignore an installation (or stop using an allowed one): nothing mints for it, and no project keeps it as a default. */
export async function ignoreAccount(id: string, by: string): Promise<void> {
  await existing(id)
  await prisma.gitHubInstallation.update({ where: { id }, data: { state: 'IGNORED', decidedById: by, decidedAt: new Date() } })
  await clearStaleDefaults(id)
}
