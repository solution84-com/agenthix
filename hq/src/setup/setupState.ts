/**
 * Setup runs once per hq, for its first admin only (getting-in spec, The first
 * admin): You · Your organisation · Model access. The first admin is whoever
 * made their account with the first-admin link; an admin invited later accepts
 * an invitation like anyone else and is never sent through setup. Setup is done
 * when that admin finishes or skips its last step, recorded on the organisation.
 */
import { HttpError, prisma } from 'wasp/server'
import { providerTypesCovered, providersComplete, type HqClaimState } from '@agenthix/core'
import { providerStore } from '../providers/store'

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

/** The step setup opens at, by what the organisation's providers already cover (setup spec, Resuming). */
export type SetupResumeStep = 'choice' | 'voice' | 'organisation'

type ProviderFacts = Parameters<typeof providersComplete>[0]

/** The first step whose need is unmet: no working LLM, the choice; an LLM but no STT or TTS, voice; otherwise the organisation. */
export function setupResumeStep(providers: ProviderFacts): SetupResumeStep {
  const covered = providerTypesCovered(providers)
  if (!covered.llm) return 'choice'
  if (!covered.stt || !covered.tts) return 'voice'
  return 'organisation'
}

export async function currentSetupResumeStep(): Promise<SetupResumeStep> {
  return setupResumeStep(await providerStore().list())
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
 * Records setup as done; only the first admin, and only once. Refused (409) until the providers reach a working LLM,
 * STT and TTS, so a finished setup always has models and voice.
 */
export async function finishSetup(userId: string, now = new Date()): Promise<boolean> {
  if (!(await needsSetup(userId))) return false
  if (!providersComplete(await providerStore().list())) {
    throw new HttpError(409, 'Add a model provider and a speech-to-text and a text-to-speech provider that work before finishing setup')
  }
  const { count } = await prisma.org.updateMany({ where: { setupCompletedAt: null }, data: { setupCompletedAt: now } })
  return count > 0
}
