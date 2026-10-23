/**
 * A person's own Claude subscription, as their settings show it (models from one place, part 4): whether they are
 * signed in and until when, and signing out. Never the login itself.
 */
import { HttpError, prisma } from 'wasp/server'

export type MyClaudeSubscription = { signedIn: boolean; expiresAt: string | null }

const mine = (userId: string) => ({ ownerUserId: userId, vendor: 'anthropic' as const, credentialKind: 'subscription' as const })

export const getMyClaudeSubscription = async (_args: void, context: { user?: { id: string } | null }): Promise<MyClaudeSubscription> => {
  if (!context.user) throw new HttpError(401)
  const row = await prisma.aiProvider.findFirst({ where: mine(context.user.id), select: { termsAcceptedAt: true, expiresAt: true } })
  return { signedIn: !!row?.termsAcceptedAt, expiresAt: row?.expiresAt?.toISOString() ?? null }
}

export const removeMyClaudeSubscription = async (_args: void, context: { user?: { id: string } | null }): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  await prisma.aiProvider.deleteMany({ where: mine(context.user.id) })
}
