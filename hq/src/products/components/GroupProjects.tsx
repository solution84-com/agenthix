import { Link } from 'react-router'
import { useQuery, getProjects, getProjectCards } from 'wasp/client/operations'
import { ProjectCard } from '@agenthix/ui/projects'
import { projectCardNow } from '../../projects/pages/projectCardNow'
import type { GroupKind } from './groupKinds'

type ProjectRow = {
  id: string; key: string; name: string; description: string | null
  productId: string | null; programId: string | null; personalOwnerId: string | null; isMember: boolean
  boards?: { id: string }[]; tasks?: { status: string }[]
}

/** The projects filed under one product or programme, as the Projects screen draws them. */
export function GroupProjects({ kind, groupId }: { kind: GroupKind; groupId: string }) {
  const { data, isLoading } = useQuery(getProjects)
  const { data: cards } = useQuery(getProjectCards)
  const lineOf = new Map((cards?.cards ?? []).map(c => [c.projectId, c]))
  const field = kind === 'product' ? 'productId' : 'programId'
  const projects: ProjectRow[] = (data ?? []).filter(p => p[field] === groupId)
  const at = new Date()
  if (isLoading) return <p className="text-body text-text-muted">Loading…</p>
  if (projects.length === 0) return <p className="text-body text-text-muted">No project is filed here yet.</p>
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {projects.map(project => (
        <ProjectCard
          key={project.id}
          as={Link}
          to={`/projects/${project.key}`}
          project={{
            id: project.id,
            name: project.name,
            description: project.description,
            now: project.isMember === false ? { state: 'quiet' as const } : projectCardNow(lineOf.get(project.id), at),
            notJoined: project.isMember === false,
            boardCount: project.boards?.length ?? 0,
            doneTaskCount: project.tasks?.filter(t => t.status === 'DONE').length ?? 0,
            totalTaskCount: project.tasks?.length ?? 0,
          }}
        />
      ))}
    </div>
  )
}
