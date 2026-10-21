/**
 * The keys a provider refused while a conversation talked on them (model access spec): stored on the
 * conversation when the person switches away from one, so the conversation never uses it again — neither a turn
 * falling back in the home's order nor its model picker.
 */
import { prisma } from 'wasp/server'
import { CREDENTIAL_PROVIDERS } from '@agenthix/core'
import type { RefusedAccess } from './homeAccess'

const OWNERS = ['org', 'project', 'user'] as const

/** A stored list, read back; anything malformed in it is dropped. */
export function refusedFromJson(raw: unknown): RefusedAccess[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is RefusedAccess =>
    typeof r === 'object' && r !== null &&
    (OWNERS as readonly unknown[]).includes((r as RefusedAccess).owner) &&
    (CREDENTIAL_PROVIDERS as readonly unknown[]).includes((r as RefusedAccess).provider))
}

export async function storedRefusals(conversationId: string): Promise<RefusedAccess[]> {
  if (!conversationId) return []
  const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { refusedAccess: true } })
  return refusedFromJson(row?.refusedAccess)
}

/** The stored list with one more, each key once. */
export function withRefusal(stored: readonly RefusedAccess[], refused: RefusedAccess): RefusedAccess[] {
  const kept = stored.filter(r => !(r.owner === refused.owner && r.provider === refused.provider))
  return [...kept, { owner: refused.owner, provider: refused.provider }]
}
