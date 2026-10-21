import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, getUserSettings } from 'wasp/client/operations'
import { ChevronLeft } from 'lucide-react'
import { AppShell } from '../../shared/layouts/AppShell'
import { StopAllRunsButton } from '../../shared/components/RunsPanel/StopAllRunsButton'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { RunsList } from '../components/RunsList'
import { RunPane } from '../components/RunPane'
import type { RunListItem } from '../screenTypes'

export const runAddress = (run: { runId: string | null; sessionId: string | null }, conversationId?: string | null) =>
  `/runs/${run.runId}?session=${run.sessionId}${conversationId ? `&conversation=${conversationId}` : ''}`

/**
 * The Runs screen: the person's runs, with one run opened beside the list (a phone shows the run alone). The run has
 * its own address, `/runs/<run>?session=<its conversation or task's session>`, so one site is asked for it.
 */
export function RunsPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { runId } = useParams()
  const [params] = useSearchParams()
  const { data: settings } = useQuery(getUserSettings)
  const conversationId = params.get('conversation')
  const isOrgAdmin = settings?.role === 'ADMIN'

  const open = (run: RunListItem) => {
    if (run.runId) navigate(runAddress(run, conversationId))
    else navigate(run.href)
  }

  return (
    <AppShell breadcrumbs={[{ label: 'Runs' }]}>
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-surface-1 px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-h1 font-semibold leading-8 text-text-primary">Runs</h1>
          <p className="text-small text-text-secondary">What your agents did, and are doing</p>
        </div>
        {isOrgAdmin && <StopAllRunsButton />}
      </div>

      <div className="flex min-h-0 flex-1">
        <section aria-label="Runs" className={`${runId ? 'hidden' : 'flex'} min-h-0 w-full flex-col lg:flex lg:w-[26rem] lg:shrink-0 lg:border-r lg:border-border-subtle`}>
          <RunsList selectedRunId={runId ?? null} conversationId={conversationId} onOpen={open} onFirstPage={(first) => {
            // Arriving at Runs on a desktop opens the newest run; a phone shows the list.
            if (!isMobile && !runId && first.runId) navigate(runAddress(first, conversationId), { replace: true })
          }} />
        </section>
        <section aria-label="Run" className={`${runId ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-surface-1 lg:flex`}>
          {runId && (
            <>
              <Link to={conversationId ? `/runs?conversation=${conversationId}` : '/runs'} className="flex items-center gap-1 border-b border-border-subtle px-3 py-2 text-small text-accent lg:hidden">
                <ChevronLeft size={14} aria-hidden /> Runs
              </Link>
              <RunPane runId={runId} sessionId={params.get('session')} />
            </>
          )}
        </section>
      </div>
    </AppShell>
  )
}
