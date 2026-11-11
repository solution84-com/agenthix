import { useParams } from 'react-router'
import { useQuery, getProjectPreview } from 'wasp/client/operations'
import { isFinal, useBackgroundRead } from '@agenthix/ui/attention'
import type { ProjectPreviewData } from '@agenthix/ui/people'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { ProjectPreviewPage } from './ProjectPreviewPage'

/**
 * A project screen while its project loads, or when there is none the person can see. An open project the
 * person has not joined is not missing: it shows a preview with Join (every screen reviewed spec §3, People).
 */
export function ProjectPlaceMissing({ loading }: { loading: boolean }) {
  const { key } = useParams<{ key: string }>()
  const query = useQuery(getProjectPreview, key ? { key } : undefined, { enabled: !loading && !!key })
  const { data, isLoading } = query
  const read = useBackgroundRead(query, { what: 'The project' })
  const preview = data as ProjectPreviewData | undefined
  if (preview && !preview.isMember) return <ProjectPreviewPage preview={preview} />

  const waiting = loading || (isLoading && !!key)
  // Only a final answer (404 and the like) says not found; any other failure is the nudge, with Try again.
  const unread = !waiting && read.failedWithoutData && !isFinal(query.error)
  return (
    <AppLayout breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: waiting ? '…' : unread ? 'Project' : 'Not found' }]}>
      <div className="flex h-full items-center justify-center">
        {unread ? read.nudge : <span className="text-body text-text-muted">{waiting ? 'Loading…' : 'Project not found'}</span>}
      </div>
    </AppLayout>
  )
}
