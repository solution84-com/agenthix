/**
 * Whether a person can talk to agents in their own Chat (getting-in spec,
 * Skipped steps): for the line under Home's message box and, for admins, the
 * Needs attention item — in place of the global banner, which told every admin
 * about the organisation's credentials whether or not they had their own.
 *
 * A run in a person's own Chat uses their own login or key, then the
 * organisation's (adr-0105), so they can talk when either is there. Read from
 * what is stored each time; nothing is kept.
 */
import { HttpError, prisma } from 'wasp/server'
import { computeModelAccessGap } from './modelAccessGap'
import { roleAtLeast } from '../server/identity/rolePolicy'

export type TalkAccess = {
  canTalk: boolean
  /** Where the fix is: their own login (Settings › Your model logins), or the organisation's model access, which only an admin sets. */
  fix: 'own-login' | 'org-access' | null
  isAdmin: boolean
}

export async function computeTalkAccess(userId: string): Promise<TalkAccess> {
  const [own, settings] = await Promise.all([
    prisma.modelCredential.findFirst({
      where: {
        ownerType: 'user',
        ownerId: userId,
        OR: [{ kind: 'API_KEY' }, { kind: 'SUBSCRIPTION', termsAcceptedAt: { not: null } }],
      },
      select: { id: true },
    }),
    prisma.userSettings.findUnique({ where: { userId }, select: { role: true } }),
  ])
  const isAdmin = roleAtLeast(settings?.role ?? null, 'ADMIN')
  if (own || !(await computeModelAccessGap()).missing) return { canTalk: true, fix: null, isAdmin }
  return { canTalk: false, fix: isAdmin ? 'org-access' : 'own-login', isAdmin }
}

export const getMyModelAccess = async (_args: void, context: { user?: { id: string } | null }): Promise<TalkAccess> => {
  if (!context.user) throw new HttpError(401)
  return computeTalkAccess(context.user.id)
}
