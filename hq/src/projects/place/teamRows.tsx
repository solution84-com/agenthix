import type { ReactNode } from 'react'
import type { PlaceTool } from '../../places/placeTypes'
import { AuthedPersonAvatar } from '../../people/AuthedPersonAvatar'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { ProjectMembersTool } from './members/ProjectMembersTool'

/** What `getProjectPanelRows` answers: the count and up to four pictures of each. */
export interface PanelRows {
  people: { count: number; avatars: { userId: string; name: string; avatarUrl: string | null }[] }
  agents: { count: number; avatars: { id: string; name: string; avatarUrl: string | null }[] }
}

const FACES = 4

function Stack({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 items-center -space-x-1.5 [&>*]:ring-2 [&>*]:ring-surface-1 [&>*]:rounded-full">{children}</span>
}

/**
 * Members (every screen reviewed spec §3): one row after the place's facts on Overview, with up to four pictures and a
 * count of the people and agents, and a section of its own. A person's own space has none.
 */
export function teamRows(projectId: string, rows: PanelRows | undefined): PlaceTool[] {
  const faces = rows && [
    ...rows.people.avatars.map(p => <AuthedPersonAvatar key={p.userId} person={p} size="sm" />),
    ...rows.agents.avatars.map(a => <AuthedAgentAvatar key={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />),
  ].slice(0, FACES)
  return [
    {
      id: 'members',
      label: 'Members',
      count: rows ? String(rows.people.count + rows.agents.count) : undefined,
      avatars: faces && <Stack>{faces}</Stack>,
      render: () => <ProjectMembersTool projectId={projectId} />,
    },
  ]
}

/** `?tool=people` and `?tool=agents` still open a project's Members section, so links that name them keep working. */
export function memberAliases(projectId: string): PlaceTool[] {
  return ['people', 'agents'].map(id => ({ id, label: 'Members', aliasOf: 'members', render: () => <ProjectMembersTool projectId={projectId} /> }))
}
