/**
 * Operations behind the GitHub screens (workflows spec part 4, *Several GitHub accounts*). Deciding on an account is an
 * organisation administrator's; a project's default account is its administrators'. An agent is never either: the
 * operations take the signed-in person only.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { getApp } from './githubApp'
import { allowAccount, changeAccountRule, ignoreAccount, type AccountRuleInput } from './accountRules'
import { accountList, accountsForPlace, GITHUB_POLL } from './accountViews'
import { currentFacts, refreshGitHubFacts } from './githubFacts'
import { installLinkFor } from './installLink'
import { recalledFacts, type AppOwner } from './permissionFacts'
import { mayAdministerPlace, mayReadPlace } from '../workflows/placeAccess'

type Ctx = { user?: { id: string } | null }

const ORG_ONLY = 'Deciding which GitHub accounts HQ uses'

async function orgAdmin(context: Ctx, what = ORG_ONLY): Promise<string> {
  await requireRole(context, 'ADMIN', what, `${what} needs an organisation administrator; ask one. Nothing was changed.`)
  return context.user!.id
}

/** Where the App's permissions are changed on GitHub: under the organisation that owns it, or under a person's own settings. */
function appSettingsUrl(slug: string, owner: AppOwner | null): string {
  const app = encodeURIComponent(slug)
  return owner?.type === 'Organization'
    ? `https://github.com/organizations/${encodeURIComponent(owner.login)}/settings/apps/${app}/permissions`
    : `https://github.com/settings/apps/${app}/permissions`
}

async function orgName(): Promise<string> {
  return (await prisma.org.findFirst({ select: { name: true } }))?.name ?? 'Our organisation'
}

/** The App, its real permissions, and every account with its reach and rule. */
export const getGitHubAccounts = async (_args: unknown, context: Ctx) => {
  await orgAdmin(context, 'The GitHub accounts')
  const app = await getApp()
  if (!app) return { registered: false as const }
  await currentFacts()
  const facts = recalledFacts()
  return {
    registered: true as const,
    slug: app.slug,
    appPermissions: facts.app,
    owner: facts.owner,
    appSettingsUrl: appSettingsUrl(app.slug, facts.owner),
    accounts: await accountList(),
    poll: GITHUB_POLL,
  }
}

/** Reads GitHub again; with `knownInstallationIds`, says which accounts are new since the screen last looked. */
export const checkForGitHubAccounts = async (args: { knownInstallationIds?: number[] } | undefined, context: Ctx) => {
  await orgAdmin(context, 'Looking for GitHub accounts')
  if (!(await getApp())) throw new HttpError(409, 'No GitHub App is registered yet. Nothing was changed.')
  await refreshGitHubFacts()
  const accounts = await accountList()
  const known = new Set(args?.knownInstallationIds ?? [])
  return { accounts, newInstallationIds: accounts.filter((a) => !known.has(a.installationId)).map((a) => a.installationId) }
}

export const allowGitHubAccount = async (args: { id: string } & AccountRuleInput, context: Ctx) => {
  const by = await orgAdmin(context)
  await allowAccount(args.id, by, args)
  return { ok: true }
}

export const changeGitHubAccountRule = async (args: { id: string } & AccountRuleInput, context: Ctx) => {
  const by = await orgAdmin(context)
  await changeAccountRule(args.id, by, args)
  return { ok: true }
}

export const ignoreGitHubAccount = async (args: { id: string }, context: Ctx) => {
  const by = await orgAdmin(context)
  await ignoreAccount(args.id, by)
  return { ok: true }
}

/** The link and note to send a client. */
export const getGitHubInstallLink = async (_args: unknown, context: Ctx) => {
  await orgAdmin(context, 'The GitHub install link')
  const app = await getApp()
  if (!app) throw new HttpError(409, 'No GitHub App is registered yet. Register it under Manage organisation › Settings › GitHub first. Nothing was changed.')
  return installLinkFor(app.slug, await orgName())
}

/** The accounts a project may connect to, and its default. Any member may read them. */
export const getProjectGitHubAccounts = async (args: { projectId: string }, context: Ctx) => {
  if (!context.user) throw new HttpError(401)
  const place = { type: 'project' as const, id: args.projectId }
  if (!(await mayReadPlace(place, context.user.id))) throw new HttpError(403, 'You can\'t see this project\'s GitHub accounts. Nothing was changed.')
  await currentFacts()
  return { ...(await accountsForPlace(place)), mayChangeDefault: await mayAdministerPlace(place, context.user.id) }
}

/** The accounts the caller's own space may connect to: those whose rule chose that person. */
export const getMyGitHubAccounts = async (_args: void, context: Ctx) => {
  if (!context.user) throw new HttpError(401)
  await currentFacts()
  return accountsForPlace({ type: 'user', id: context.user.id })
}

/** Set or clear (null) a project's default account, from the accounts it may connect to. */
export const setProjectGitHubDefault = async (args: { projectId: string; installationId: string | null }, context: Ctx) => {
  if (!context.user) throw new HttpError(401)
  const place = { type: 'project' as const, id: args.projectId }
  if (!(await mayAdministerPlace(place, context.user.id))) {
    throw new HttpError(403, 'Setting the default GitHub account needs one of this project\'s administrators; ask them. Nothing was changed.')
  }
  if (args.installationId !== null) {
    const { accounts } = await accountsForPlace(place)
    if (!accounts.some((a) => a.id === args.installationId)) {
      throw new HttpError(403, 'This project may not connect to that GitHub account. An organisation administrator allows it under Manage organisation › Settings › GitHub. Nothing was changed.')
    }
  }
  await prisma.project.update({ where: { id: args.projectId }, data: { defaultGitHubInstallationId: args.installationId } })
  return { ok: true }
}
