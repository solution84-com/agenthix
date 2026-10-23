import type { ResolveRequest, Resolution } from '@agenthix/core'
import type { CallCosting } from './types'

/** What a call's ledger row is costed to, from its resolution and where it was asked (F2: decided with the resolution). */
export function costingOf(r: Pick<Resolution, 'purpose' | 'basis' | 'billingProfileId'>, req: Pick<ResolveRequest, 'place' | 'agentId' | 'userId' | 'conversationId'>): CallCosting {
  const projectId = req.place.kind === 'organisation' ? null : req.place.projectId ?? null
  return {
    purpose: r.purpose, basis: r.basis, billingProfileId: r.billingProfileId,
    projectId, agentId: req.agentId ?? null, userId: req.userId ?? null, conversationId: req.conversationId ?? null,
  }
}
