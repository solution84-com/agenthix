import { prisma } from 'wasp/server'
import type { PlatformFactsStore } from './platformFacts'

export const platformFactsStore: PlatformFactsStore = {
  async askerIds() {
    return (await prisma.cloudSignInAsk.findMany({ select: { userId: true } })).map(r => r.userId)
  },
  countActive: userIds => prisma.user.count({ where: { id: { in: userIds }, deactivatedAt: null, erasedAt: null } }),
  async dismissedBy(userId) {
    return (await prisma.offerDismissal.findMany({ where: { userId }, select: { offer: true } })).map(r => r.offer)
  },
  async dismiss(userId, offer) {
    await prisma.offerDismissal.upsert({ where: { userId_offer: { userId, offer } }, create: { userId, offer }, update: {} })
  },
}
