import { KnowledgeTool } from '../../storage/pages/KnowledgeTool'

/** The project's Knowledge tool, for the organisation's own pages: the same screens, one level up. */
export function OrgKnowledgeTool() {
  return <KnowledgeTool owner={{ ownerType: 'org' }} />
}
