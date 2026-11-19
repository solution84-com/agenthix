import { type UpdateUserSettings, type UpdateUserRole, type UpdateSiteConfig, type UpdateOrg, type UpdateRiskRules } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { refreshInstallations, disconnectApp } from '../github/githubApp'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { changeOrgPackage, prepareOrgPackage } from '../packages/orgPackageService'
import type { OrgRole } from '../server/identity/rolePolicy'
import { leaveRoomsNoLongerAllowed } from '../server/roomAccess'
import { parseRiskRules } from './riskRules'
import { redrawIfFollowsName } from '../pictures/service'

type UpdateUserSettingsArgs = {
  config?: any
  // What a message sent into a conversation whose turn is still running does
  // (person-scoped execution spec §2) — read on the Profile page.
  busyConversationMode?: 'WAIT' | 'INTERRUPT'
  /** The person's own Adaptive voice in a voice conversation. */
  adaptiveVoice?: boolean
  /** Under Adaptive voice: the listening sounds. */
  voiceHums?: boolean
  /** Under Adaptive voice: Expressive tone. */
  voiceExpressiveTone?: boolean
  /** Whether the person's calls make their short sounds. */
  voiceSounds?: boolean
}

export const updateUserSettings: UpdateUserSettings<UpdateUserSettingsArgs, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }
  if (args.adaptiveVoice !== undefined && typeof args.adaptiveVoice !== 'boolean') {
    throw new HttpError(400, 'Adaptive voice is on or off')
  }
  if (args.voiceHums !== undefined && typeof args.voiceHums !== 'boolean') {
    throw new HttpError(400, 'Hums are on or off')
  }
  if (args.voiceExpressiveTone !== undefined && typeof args.voiceExpressiveTone !== 'boolean') {
    throw new HttpError(400, 'Expressive tone is on or off')
  }
  if (args.voiceSounds !== undefined && typeof args.voiceSounds !== 'boolean') {
    throw new HttpError(400, 'Voice sounds are on or off')
  }

  return context.entities.UserSettings.upsert({
    where: { userId: context.user.id },
    update: {
      ...(args.config !== undefined && { config: args.config }),
      ...(args.busyConversationMode !== undefined && { busyConversationMode: args.busyConversationMode }),
      ...(args.adaptiveVoice !== undefined && { adaptiveVoice: args.adaptiveVoice }),
      ...(args.voiceHums !== undefined && { voiceHums: args.voiceHums }),
      ...(args.voiceExpressiveTone !== undefined && { voiceExpressiveTone: args.voiceExpressiveTone }),
      ...(args.voiceSounds !== undefined && { voiceSounds: args.voiceSounds }),
    },
    create: {
      userId: context.user.id,
      role: 'MEMBER',
      config: args.config ?? {},
      ...(args.busyConversationMode !== undefined && { busyConversationMode: args.busyConversationMode }),
      ...(args.adaptiveVoice !== undefined && { adaptiveVoice: args.adaptiveVoice }),
      ...(args.voiceHums !== undefined && { voiceHums: args.voiceHums }),
      ...(args.voiceExpressiveTone !== undefined && { voiceExpressiveTone: args.voiceExpressiveTone }),
      ...(args.voiceSounds !== undefined && { voiceSounds: args.voiceSounds }),
    },
  })
}

/** Serialises role changes, so that two admins demoting each other cannot both pass the check that an admin remains. */
const ROLE_CHANGE_LOCK = 'org-role-change'

export const updateUserRole: UpdateUserRole<{ userId: string; role: OrgRole }, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Changing a role', 'Admin access required')
  const callerId = context.user!.id
  if (args.userId === callerId) throw new HttpError(400, 'Cannot change your own role')
  if (args.role !== 'ADMIN' && args.role !== 'MEMBER') throw new HttpError(400, 'A role is ADMIN or MEMBER')
  // A row is only ever made for someone who is in the organisation: not for an unknown id, nor for a person who has left or been erased.
  const person = typeof args.userId === 'string'
    ? await prisma.user.findUnique({ where: { id: args.userId }, select: { deactivatedAt: true, erasedAt: true } })
    : null
  if (!person) throw new HttpError(404, 'Person not found')
  if (person.erasedAt || person.deactivatedAt) throw new HttpError(400, 'This person has left the organisation, so their role cannot be changed')

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ROLE_CHANGE_LOCK}, 0))`
    // Read again under the lock: another admin's change may have taken the caller's own role while this one waited,
    // and the caller is the admin who stays.
    const caller = await tx.userSettings.findUnique({ where: { userId: callerId }, select: { role: true } })
    if (caller?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')
    await tx.userSettings.upsert({
      where: { userId: args.userId },
      create: { userId: args.userId, role: args.role, config: {} },
      update: { role: args.role },
    })
  })
  // A role taken away may take a room with it.
  void leaveRoomsNoLongerAllowed([args.userId])
}

type UpdateSiteConfigArgs = {
  name: string
  description: string
}

export const updateSiteConfig: UpdateSiteConfig<UpdateSiteConfigArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Updating the site', 'Admin access required')

  const name = args.name.trim()
  if (name === '') throw new HttpError(400, 'Name is required')

  const data = { name, description: args.description }
  const existing = await context.entities.SiteConfig.findFirst()
  if (existing) {
    await context.entities.SiteConfig.update({ where: { id: existing.id }, data })
  } else {
    await context.entities.SiteConfig.create({ data })
  }
}

type UpdateOrgArgs = { name: string; vision: string; mission: string }

export const updateOrg: UpdateOrg<UpdateOrgArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Updating the organisation')
  // The browser's arguments are whatever the request carried: the name is text and not empty, and only the named fields are written.
  const name = typeof args.name === 'string' ? args.name.trim() : ''
  if (!name) throw new HttpError(400, 'The organisation needs a name')
  const data = { name, vision: String(args.vision ?? ''), mission: String(args.mission ?? '') }
  // The Org row and the org package it feeds move together: a write failure
  // (bad content, or a concurrent change) rolls the row write back too,
  // rather than leaving the DB and the package disagreeing. A first-ever
  // write's disk reads are done here, before the transaction opens —
  // reading them inside prisma.$transaction risks its 5s interactive-
  // transaction timeout on sequential disk I/O.
  const initialFiles = await prepareOrgPackage()
  const before = await prisma.org.findFirst({ select: { name: true } })
  await packageWriteOrHttp(() => prisma.$transaction(async (tx) => {
    const existing = await tx.org.findFirst()
    if (existing) {
      await tx.org.update({ where: { id: existing.id }, data })
    } else {
      await tx.org.create({ data })
    }
    return changeOrgPackage(files => files, context.user!.id, tx, initialFiles ?? undefined)
  }))
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (org && before?.name !== name) await redrawIfFollowsName({ kind: 'org', id: org.id })
}

export const refreshGithubInstallations = async (_args: unknown, context: { user?: { id: string } | null }): Promise<{ ok: boolean }> => {
  await requireRole(context, 'ADMIN', 'Refreshing GitHub installations')
  await refreshInstallations()
  return { ok: true }
}

export const disconnectGithubApp = async (_args: unknown, context: { user?: { id: string } | null }): Promise<{ ok: boolean }> => {
  await requireRole(context, 'ADMIN', 'Disconnecting the GitHub App')
  await disconnectApp()
  return { ok: true }
}

// ── Risk rules ────────────────────────────────────────────────────────────────

// What the screen sends. The body is a client's, so `parseRiskRules` takes it as unknown.
type UpdateRiskRulesArgs = { rules: { pattern: string; riskLevel: string }[] }

export const updateRiskRules: UpdateRiskRules<UpdateRiskRulesArgs, void> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Updating the risk rules', 'Admin access required')
  const parsed = parseRiskRules(args.rules)
  if ('error' in parsed) throw new HttpError(400, `${parsed.error} Nothing was changed.`)

  const existing = await context.entities.SiteConfig.findFirst()
  if (existing) {
    await context.entities.SiteConfig.update({ where: { id: existing.id }, data: { riskRules: parsed.rules } })
  } else {
    await context.entities.SiteConfig.create({ data: { name: 'default', riskRules: parsed.rules } })
  }
}
