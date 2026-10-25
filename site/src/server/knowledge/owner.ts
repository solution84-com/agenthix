/**
 * Who a knowledge method is about, on the wire and in a refusal: a project, a person, or the organisation
 * (`KnowledgeOwnerRef`, site protocol 1.7). Only knowledge takes the organisation; files, workspaces and mounts stay a
 * person's or a project's.
 */
import { z } from 'zod'
import { KNOWLEDGE_ORG_OWNER_ID, KNOWLEDGE_OWNER_TYPES, type KnowledgeOwnerRef } from '@agenthix/core'

export const knowledgeOwnerShape = {
  ownerType: z.enum(KNOWLEDGE_OWNER_TYPES),
  ownerId: z.string().min(1),
}

/** The organisation's knowledge has one id on every site; anything else for it is a malformed call. */
export function orgIdIsFixed(owner: KnowledgeOwnerRef): boolean {
  return owner.ownerType !== 'org' || owner.ownerId === KNOWLEDGE_ORG_OWNER_ID
}

/** hq's own ids, never a path on this disk: what a refusal may name. */
export function describeKnowledgeOwner(owner: KnowledgeOwnerRef): string {
  return owner.ownerType === 'org' ? "the organisation's knowledge" : `${owner.ownerType} ${owner.ownerId} knowledge`
}

/** A page's name as a refusal may echo it: never an absolute path, which would be a path on this disk. */
export function nameForRefusal(name: string): string {
  return /^(?:[/\\]|[A-Za-z]:)/.test(name) ? '(an absolute path)' : name.slice(0, 200)
}
