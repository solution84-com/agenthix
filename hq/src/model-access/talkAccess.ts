/**
 * Whether a person can talk to agents in their own Chat: for the line under Home's message box and, for organisation
 * admins, the Needs attention item. Asked of the one resolver (models from one place, part 4), as a conversation in
 * their space would be; nothing is kept.
 */
import { HttpError, prisma } from 'wasp/server'
import { providerTypesOf } from '@agenthix/core'
import { roleAtLeast } from '../server/identity/rolePolicy'
import { resolve } from '../routing/resolver'
import { providerStore } from '../providers/store'

export type TalkAccess = {
  canTalk: boolean
  /** Where the fix is: always the organisation's providers and models, which an organisation admin sets. */
  fix: 'org-access' | null
  isAdmin: boolean
  /** Whether any provider of models, and of both halves of voice, has been added at all, working or not: none is "not set up", not "down" (ADR-0160). */
  added: { model: boolean; voice: boolean }
}

export async function computeTalkAccess(userId: string): Promise<TalkAccess> {
  const [answer, settings, providers] = await Promise.all([
    resolve({ purpose: 'conversation', place: { kind: 'own', userId }, userId }),
    prisma.userSettings.findUnique({ where: { userId }, select: { role: true } }),
    providerStore().list(),
  ])
  const isAdmin = roleAtLeast(settings?.role ?? null, 'ADMIN')
  const typesOf = new Map(providers.map(p => [p.id, providerTypesOf(p.vendor)] as const))
  const has = (type: 'llm' | 'stt' | 'tts') => providers.some(p => typesOf.get(p.id)?.includes(type))
  const added = { model: has('llm'), voice: has('stt') && has('tts') }
  return answer.ok ? { canTalk: true, fix: null, isAdmin, added } : { canTalk: false, fix: 'org-access', isAdmin, added }
}

export const getMyModelAccess = async (_args: void, context: { user?: { id: string } | null }): Promise<TalkAccess> => {
  if (!context.user) throw new HttpError(401)
  return computeTalkAccess(context.user.id)
}
