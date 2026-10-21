/**
 * What the Organisation page's cards read that no other operation gives
 * (every screen reviewed spec §3, Organisation): the people the organisation
 * has, for everyone, and the state of each organisation setting, for admins.
 * Reads of fields that already exist; nothing is written.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { ACTIVE_PERSON, peopleByIds } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'
import { getOrgModelKeyStatus } from '../server/providerService'
import { getOrgRunLimits } from '../agents/runLimits/runLimitsService'
import { loadOrgAutomation } from '../automation/automationStore'
import { CREDENTIAL_PROVIDERS, PROVIDER_LABELS } from '../shared/modelProviders'

type Ctx = { user?: { id: string } | null }

const FACES = 6

export type WorkplacePeople = {
  count: number
  /** The first few, for the card's faces. */
  faces: PersonSummary[]
  /** Invitations still open, for admins; null for anyone else. */
  waitingInvitations: { count: number; latestAt: Date | null } | null
}

export const getWorkplacePeople = async (_args: unknown, context: Ctx): Promise<WorkplacePeople> => {
  if (!context.user) throw new HttpError(401)
  const [count, users, admin] = await Promise.all([
    prisma.user.count({ where: ACTIVE_PERSON }),
    prisma.user.findMany({ where: ACTIVE_PERSON, select: { id: true }, orderBy: { id: 'asc' }, take: FACES }),
    prisma.userSettings.findUnique({ where: { userId: context.user.id }, select: { role: true } }),
  ])
  const people = await peopleByIds(users.map(u => u.id))
  let waitingInvitations: WorkplacePeople['waitingInvitations'] = null
  if (admin?.role === 'ADMIN') {
    const now = new Date()
    const waiting = await prisma.invite.findMany({
      where: { consumedAt: null, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    waitingInvitations = { count: waiting.length, latestAt: waiting[0]?.createdAt ?? null }
  }
  return { count, faces: users.map(u => people.get(u.id)!).filter(Boolean), waitingInvitations }
}

export type OrgSettingsState = {
  /** The providers the organisation has a key or a login for, by name. */
  modelProviders: string[]
  githubAccounts: number
  runLimits: { timeLimitMinutes: number; turnLimit: number }
  riskRules: number
  automationAllowed: boolean
  voiceOn: boolean
}

export const getOrgSettingsState = async (_args: unknown, context: Ctx): Promise<OrgSettingsState> => {
  await requireRole(context, 'ADMIN', "Reading the organisation's settings")
  const [keys, logins, githubAccounts, runLimits, config, automation, voice] = await Promise.all([
    Promise.all(CREDENTIAL_PROVIDERS.map(async p => ((await getOrgModelKeyStatus(p)).present ? p : null))),
    prisma.modelCredential.findMany({ where: { ownerType: 'org' }, select: { provider: true } }),
    prisma.gitHubInstallation.count(),
    getOrgRunLimits(),
    prisma.siteConfig.findFirst({ select: { riskRules: true } }),
    loadOrgAutomation(),
    prisma.provider.count({ where: { service: { in: ['stt', 'tts'] }, isEnabled: true } }),
  ])
  const have = new Set<string>([...keys.filter((p): p is NonNullable<typeof p> => p !== null), ...logins.map(l => l.provider)])
  return {
    modelProviders: [...CREDENTIAL_PROVIDERS].sort((a, b) => Number(b === 'anthropic') - Number(a === 'anthropic')).filter(p => have.has(p)).map(p => PROVIDER_LABELS[p]),
    githubAccounts,
    runLimits: { timeLimitMinutes: runLimits.timeLimitMinutes, turnLimit: runLimits.turnLimit },
    riskRules: Array.isArray(config?.riskRules) ? config.riskRules.length : 0,
    automationAllowed: automation.allowed,
    voiceOn: voice > 0,
  }
}
