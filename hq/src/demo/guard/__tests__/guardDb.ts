/** The rows the demo guard reads, for its tests: `vi.mock('wasp/server', () => import('./guardDb'))`. */
export const db = {
  counts: new Map<string, number>(),
}

export const prisma = {
  rateLimit: {
    upsert: async ({ where, create, update }: { where: { ip: string }; create: { count: number }; update: { count?: { increment: number } } }) => {
      const count = db.counts.has(where.ip) ? db.counts.get(where.ip)! + (update.count?.increment ?? 0) : create.count
      db.counts.set(where.ip, count)
      return { count }
    },
    update: async ({ where, data }: { where: { ip: string }; data: { count: { decrement: number } } }) => {
      db.counts.set(where.ip, db.counts.get(where.ip)! - data.count.decrement)
    },
  },
}
