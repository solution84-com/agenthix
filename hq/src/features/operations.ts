/**
 * The *Features* screen's operations (live preview spec section 7; adr-0172). `getFeatures` answers which flags are on
 * for anyone signed in, so screens can hide what is off (`useFeature`); the server's gate is `requireFeature`.
 * `setFeature` is the only switch: an organisation admin's, stored on the organisation's record.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import {
  FEATURE_FLAG_NAMES, featureStates, isDevelopmentBuild, isSwitchable, stageOf, type FeatureFlag,
} from '@agenthix/core'
import { requireRole } from '../server/identity/requireRole'
import { FEATURE_WORDS, type FeaturesAnswer, type FeatureRow } from '../shared/features'
import { forgetFeatureSwitches, loadStoredSwitches, readStoredSwitches, switchesOf, type StoredSwitches } from './switches'

type Ctx = { user?: { id: string } | null }

async function namesOf(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, auth: { select: { identities: { select: { providerUserId: true }, take: 1 } } } },
  })
  return new Map(users.map(u => [u.id, u.displayName ?? u.auth?.identities[0]?.providerUserId ?? 'Someone']))
}

/** Every flag's state for this organisation, as the screen and `useFeature` read it. */
export async function featuresAnswer(stored: StoredSwitches, isAdmin: boolean): Promise<FeaturesAnswer> {
  const env = process.env
  const states = featureStates({ env, switches: switchesOf(stored) })
  const names = isAdmin
    ? await namesOf([...new Set(Object.values(stored).flatMap(s => (s?.byUserId ? [s.byUserId] : [])))])
    : new Map<string, string>()
  const flags: FeatureRow[] = FEATURE_FLAG_NAMES.map(flag => {
    const entry = stored[flag]
    return {
      flag,
      ...states[flag],
      changed: isAdmin && entry ? { by: entry.byUserId ? names.get(entry.byUserId) ?? null : null, at: entry.at } : null,
    }
  })
  return { development: isDevelopmentBuild(env), isAdmin, flags }
}

export const getFeatures = async (_args: unknown, context: Ctx): Promise<FeaturesAnswer> => {
  if (!context.user) throw new HttpError(401)
  const settings = await prisma.userSettings.findUnique({ where: { userId: context.user.id }, select: { role: true } })
  return featuresAnswer(await loadStoredSwitches(), settings?.role === 'ADMIN')
}

function parseFlag(raw: unknown): FeatureFlag {
  const flag = (FEATURE_FLAG_NAMES as readonly unknown[]).includes(raw) ? (raw as FeatureFlag) : null
  if (!flag) throw new HttpError(400, `There is no feature called ${JSON.stringify(String(raw)).slice(0, 80)}. Nothing was changed.`)
  return flag
}

/**
 * Switches one flag on or off for the whole organisation. In production only a beta (to turn it on) or a flag released
 * in this minor release (to turn it off) can be switched; a development build switches any.
 */
export const setFeature = async (args: { flag: string; on: boolean }, context: Ctx): Promise<FeaturesAnswer> => {
  await requireRole(context, 'ADMIN', 'Switching a feature',
    'Only an organisation admin can switch a feature. Ask one of them. Nothing was changed.')
  const flag = parseFlag(args?.flag)
  if (typeof args?.on !== 'boolean') throw new HttpError(400, 'Say whether to switch it on or off. Nothing was changed.')
  if (!isSwitchable(flag, process.env)) {
    throw new HttpError(403, `${FEATURE_WORDS[flag].title} cannot be switched here: it is not in beta or new in this ` +
      `release (it is at ${stageOf(flag)}), and only those can be switched in production. Nothing was changed.`)
  }
  const byUserId = context.user!.id
  const stored = await prisma.$transaction(async tx => {
    const org = await tx.org.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
    if (!org) throw new HttpError(409, 'There is no organisation yet. Finish setting up HQ first. Nothing was changed.')
    // Rows are locked one at a time, so two admins switching at once both keep their switch.
    await tx.$queryRaw`SELECT id FROM "Org" WHERE id = ${org.id} FOR UPDATE`
    const current = await tx.org.findUniqueOrThrow({ where: { id: org.id }, select: { featureSwitches: true } })
    const next: StoredSwitches = { ...readStoredSwitches(current.featureSwitches), [flag]: { on: args.on, byUserId, at: new Date().toISOString() } }
    await tx.org.update({ where: { id: org.id }, data: { featureSwitches: next as Prisma.InputJsonObject } })
    return next
  })
  forgetFeatureSwitches()
  return featuresAnswer(stored, true)
}
