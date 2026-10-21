import { useParams } from 'react-router'
import { useQuery, getProjectPreview } from 'wasp/client/operations'
import type { ProjectPreviewData } from '@agenthix/ui/people'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { ProjectPreviewPage } from './ProjectPreviewPage'

/**
 * A project screen while its project loads, or when there is none the person can see. An open project the
 * person has not joined is not missing: it shows a preview with Join (every screen reviewed spec §3, People).
 */
export function ProjectPlaceMissing({ loading }: { loading: boolean }) {
  const { key } = useParams<{ key: string }>()
  const { data, isLoading } = useQuery(getProjectPreview, key ? { key } : undefined, { enabled: !loading && !!key, retry: false })
  const preview = data as ProjectPreviewData | undefined
  if (preview && !preview.isMember) return <ProjectPreviewPage preview={preview} />

  const waiting = loading || (isLoading && !!key)
  return (
    <AppLayout breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: waiting ? '…' : 'Not found' }]}>
      <div className="flex h-full items-center justify-center">
        <span className="text-body text-text-muted">{waiting ? 'Loading…' : 'Project not found'}</span>
      </div>
    </AppLayout>
  )
}
