import { KNOWLEDGE_ORG_OWNER_ID } from '@agenthix/core'
import type { MarkdownEmbedContext } from '../../../shared/components/MarkdownMessage'
import type { KnowledgeOwner } from './knowledgeTypes'

/** The section a page sits in: '' at the top. */
export function pageFolder(page: string): string {
  return page.slice(0, Math.max(0, page.lastIndexOf('/')))
}

/**
 * A page's images and file links resolve in its owner's knowledge, against `folder`, the page's own section; a
 * project's or a person's page also reaches that owner's storage (`files/…`, `artefacts/…`, `workspaces/<id>/…`), its
 * sibling. The organisation's knowledge has no storage beside it.
 */
export function pageEmbed(owner: KnowledgeOwner, folder: string): MarkdownEmbedContext {
  if (owner.ownerType === 'org') {
    return { place: { space: 'knowledge', owner: { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID } }, folder }
  }
  const ref = { ownerType: owner.ownerType, ownerId: owner.ownerId }
  return { place: { space: 'knowledge', owner: ref, siblings: ref }, folder }
}
