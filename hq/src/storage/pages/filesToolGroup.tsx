import type { PlaceToolGroup } from '../../places/placeTypes'
import { ArtefactsTool } from './ArtefactsTool'
import { FilesTool } from './FilesTool'
import { KnowledgeTool } from './KnowledgeTool'
import { WorkspacesTool } from './WorkspacesTool'
import { filesToolCounts, type FilesToolCounts } from './filesToolCounts'
import { useArtefacts, useFolder, useKnowledge, useWorkspaces, type Owner } from './filesToolData'

/** What the four tools show beside their names in the tools list; undefined while the place is not known yet. */
export function useFilesToolCounts(owner: Owner | undefined): FilesToolCounts {
  const files = useFolder(owner ?? { ownerType: 'user', ownerId: '' }, '', !!owner)
  // No owner yet (the place is still loading, or a personal project has no storage): ask nothing.
  const artefacts = useArtefacts(owner ?? { ownerType: 'user', ownerId: '' }, !!owner)
  const knowledge = useKnowledge(owner ?? { ownerType: 'user', ownerId: '' }, !!owner)
  const workspaces = useWorkspaces(owner ?? { ownerType: 'user', ownerId: '' })
  if (!owner) return {}
  return filesToolCounts({ files: files.data, artefacts: artefacts.data, topics: knowledge.data, workspaces: workspaces.workspaces })
}

/**
 * The Files heading of a place's tools list (every screen reviewed spec §3): Files, Artefacts, Knowledge and
 * Workspaces, each a tool of its own. A project and the person's own space differ only in whose storage it is.
 */
export function filesToolGroup({ owner, siteLabel, counts, personal }: {
  owner: Owner
  siteLabel: string | null
  counts: FilesToolCounts
  personal?: boolean
}): PlaceToolGroup {
  return {
    label: 'Files',
    tools: [
      { id: 'files', label: 'Files', count: counts.files, render: () => <FilesTool owner={owner} /> },
      { id: 'artefacts', label: 'Artefacts', count: counts.artefacts, render: () => <ArtefactsTool owner={owner} /> },
      { id: 'knowledge', label: 'Knowledge', count: counts.knowledge, render: () => <KnowledgeTool owner={owner} personal={personal} /> },
      { id: 'workspaces', label: 'Workspaces', count: counts.workspaces, render: () => <WorkspacesTool owner={owner} siteLabel={siteLabel} /> },
    ],
  }
}
