/**
 * Whether a person can talk to agents in their own Chat: for the line under Home's message box and, for organisation
 * admins, the Needs attention item. Asked of the one resolver (models from one place, part 4), as a conversation in
 * their space would be; nothing is kept.
 */
import { HttpError, prisma } from 'wasp/server'
import { roleAtLeast } from '../server/identity/rolePolicy'
import { resolve } from '../routing/resolver'

export type TalkAccess = {
  canTalk: boolean
  /** Where the fix is: always the organisation's providers and models, which an organisation admin sets. */
  fix: 'org-access' | null
  isAdmin: boolean
}

export async function computeTalkAccess(userId: string): Promise<TalkAccess> {
  const [answer, settings] = await Promise.all([
    resolve({ purpose: 'conversation', place: { kind: 'own', userId }, userId }),
    prisma.userSettings.findUnique({ where: { userId }, select: { role: true } }),
  ])
  const isAdmin = roleAtLeast(settings?.role ?? null, 'ADMIN')
  return answer.ok ? { canTalk: true, fix: null, isAdmin } : { canTalk: false, fix: 'org-access', isAdmin }
}

export const getMyModelAccess = async (_args: void, context: { user?: { id: string } | null }): Promise<TalkAccess> => {
  if (!context.user) throw new HttpError(401)
  return computeTalkAccess(context.user.id)
}
