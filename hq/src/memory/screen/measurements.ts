import { prisma } from 'wasp/server'
import { DEFAULT_CERTAIN_BAR, DEFAULT_PROBABLE_BAR, type MemoryMeasurements } from '../../shared/memory/protocol'
import { countOutcomes } from './outcomeCounts'

export const MEASURED_DAYS = 30

export async function memoryMeasurements(now = new Date()): Promise<MemoryMeasurements> {
  const since = new Date(now.getTime() - MEASURED_DAYS * 86_400_000)
  const [groups, org] = await Promise.all([
    prisma.memoryOutcome.groupBy({ by: ['kind'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.org.findFirst({ select: { memoryCertainBar: true, memoryProbableBar: true } }),
  ])
  return {
    ...countOutcomes(groups.map(g => ({ kind: g.kind, count: g._count._all }))),
    certainBar: org?.memoryCertainBar ?? DEFAULT_CERTAIN_BAR,
    probableBar: org?.memoryProbableBar ?? DEFAULT_PROBABLE_BAR,
  }
}
