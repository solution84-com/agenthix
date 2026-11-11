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
import { getOrgRunLimits } from '../agents/runLimits/runLimitsService'
import { providerTypesOf } from '@agenthix/core'

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
  /** The organisation's model providers, by name. */
  modelProviders: string[]
  githubAccounts: number
  runLimits: { timeLimitMinutes: number; turnLimit: number }
  riskRules: number
  voiceOn: boolean
}

export const getOrgSettingsState = async (_args: unknown, context: Ctx): Promise<OrgSettingsState> => {
  await requireRole(context, 'ADMIN', "Reading the organisation's settings")
  const [providers, githubAccounts, runLimits, config, voice] = await Promise.all([
    prisma.aiProvider.findMany({ where: { ownerUserId: null }, select: { name: true, vendor: true }, orderBy: { createdAt: 'asc' } }),
    prisma.gitHubInstallation.count(),
    getOrgRunLimits(),
    prisma.siteConfig.findFirst({ select: { riskRules: true } }),
    prisma.provider.count({ where: { service: { in: ['stt', 'tts'] }, isEnabled: true } }),
  ])
  const llmTypes = providers.map(p => providerTypesOf(p.vendor))
  return {
    modelProviders: providers.filter((_, i) => llmTypes[i].includes('llm')).map(p => p.name),
    githubAccounts,
    runLimits: { timeLimitMinutes: runLimits.timeLimitMinutes, turnLimit: runLimits.turnLimit },
    riskRules: Array.isArray(config?.riskRules) ? config.riskRules.length : 0,
    voiceOn: voice > 0,
  }
}
