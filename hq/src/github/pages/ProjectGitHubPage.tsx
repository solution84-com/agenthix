import { useParams } from 'react-router'
import { useQuery } from 'wasp/client/operations'
import { getProjectByKey } from 'wasp/client/operations'
import { ProjectLayout } from '../../shared/layouts/ProjectLayout'
import { RepoPanel } from '../../storage/pages/RepoPanel'
import { OperationsPanel } from '../../storage/pages/OperationsPanel'

// GitHub for the project's files home (ADR-0039 §5) — its own project tab next to Files.
// Back up the project's docs to a repo, or connect an existing one.
export function ProjectGitHubPage() {
  const { key } = useParams<{ key: string }>()
  const { data: project } = useQuery(getProjectByKey, key ? { key } : undefined)
  const proj = project

  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: proj?.name ?? '…', href: key ? `/projects/${key}` : undefined },
    { label: 'GitHub' },
  ]

  return (
    <ProjectLayout breadcrumbs={breadcrumbs}>
      <div className="px-6 py-5 max-w-2xl">
        {proj && (
          <>
            <div className="max-w-lg">
              <RepoPanel target={{ ownerType: 'project', ownerId: proj.id }} repoName={proj.name} />
            </div>
            <OperationsPanel target={{ ownerType: 'project', ownerId: proj.id }} />
          </>
        )}
      </div>
    </ProjectLayout>
  )
}
