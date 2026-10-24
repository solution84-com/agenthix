import { useMemo } from 'react'
import type { PlaceTool } from '../../places/placeTypes'
import { ProjectGitHubSection } from './ProjectGitHubSection'

/** The GitHub entry of a project's panel (workflows spec part 5, U1): a section of its own. Undefined while there is no project. */
export function useGitHubTool(project: { id: string; key: string } | undefined): PlaceTool | undefined {
  const id = project?.id
  const key = project?.key
  return useMemo(() => (id && key ? {
    id: 'github',
    label: 'GitHub',
    render: () => <ProjectGitHubSection projectId={id} basePath={`/projects/${key}`} />,
  } : undefined), [id, key])
}
