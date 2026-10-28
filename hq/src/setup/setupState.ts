/**
 * Setup runs once per hq, for its first admin only (getting-in spec, The first
 * admin): You · Your organisation · how agents reach AI. The first admin is whoever
 * made their account with the first-admin link; an admin invited later accepts
 * an invitation like anyone else and is never sent through setup. Setup is done
 * when that admin finishes it, recorded on the organisation; models and voice may
 * be left for later (ADR-0160).
 */
import { prisma } from 'wasp/server'
import type { AiProviderState, AiProviderVendor, HqClaimState } from '@agenthix/core'
import { providerStore } from '../providers/store'
import { writeSetupDefaults } from './setupDefaults'

/** What decides hq's claim state; all of it is read from the data, none of it stored (setup spec, hq's setup state). */
export type ClaimFacts = { users: number; setupCompletedAt: Date | null }

export function claimStateOf({ users, setupCompletedAt }: ClaimFacts): HqClaimState {
  if (users === 0) return 'unclaimed'
  return setupCompletedAt ? 'set_up' : 'setting_up'
}

export async function claimState(): Promise<HqClaimState> {
  const [users, org] = await Promise.all([prisma.user.count(), prisma.org.findFirst({ select: { setupCompletedAt: true } })])
  return claimStateOf({ users, setupCompletedAt: org?.setupCompletedAt ?? null })
}

/** The step setup opens at, by what is already done (setup spec, Resuming). */
export type SetupResumeStep = 'organisation' | 'choice' | 'review'

type ProviderFacts = ReadonlyArray<{ vendor: AiProviderVendor; state: AiProviderState }>

/**
 * The organisation until its step is saved (which makes the default billing profile), then the AI choice while no
 * provider is added, otherwise the last look: providers once added are never asked for again, nor are missing ones.
 */
export function setupResumeStep(organisationSaved: boolean, providers: ProviderFacts): SetupResumeStep {
  if (!organisationSaved) return 'organisation'
  return providers.length === 0 ? 'choice' : 'review'
}

export async function currentSetupResumeStep(): Promise<SetupResumeStep> {
  const [profile, providers] = await Promise.all([
    prisma.billingProfile.findFirst({ where: { isDefault: true, archivedAt: null }, select: { id: true } }),
    providerStore().list(),
  ])
  return setupResumeStep(!!profile, providers)
}

export async function needsSetup(userId: string): Promise<boolean> {
  const [org, firstAdmin] = await Promise.all([
    prisma.org.findFirst({ select: { setupCompletedAt: true } }),
    prisma.invite.findFirst({ where: { kind: 'FIRST_ADMIN', consumedBy: userId }, select: { id: true } }),
  ])
  if (!firstAdmin || org?.setupCompletedAt) return false
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { role: true } })
  return settings?.role === 'ADMIN'
}

/**
 * Records setup as done; only the first admin, and only once. Never refused for providers: models and voice may be
 * left for later (ADR-0160). It writes the organisation's defaults the providers added so far can fill.
 */
export async function finishSetup(userId: string, now = new Date()): Promise<boolean> {
  if (!(await needsSetup(userId))) return false
  await writeSetupDefaults(await providerStore().list())
  const { count } = await prisma.org.updateMany({ where: { setupCompletedAt: null }, data: { setupCompletedAt: now } })
  return count > 0
}
