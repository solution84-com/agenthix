import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, getUserSettings } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { BackButton, MenuButton, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'
import { StopAllRunsButton } from '../../shared/components/RunsPanel/StopAllRunsButton'
import { RunHistory } from '../components/RunHistory'
import { RunView } from '../components/RunView'
import { runLabelOf, useRunLabel } from '../components/runLabel'

/** A run's own address: `/runs/<run>?session=<its session>`, so one site is asked for it. */
export const runAddress = (run: { runId: string; sessionId: string | null }) =>
  `/runs/${encodeURIComponent(run.runId)}${run.sessionId ? `?session=${encodeURIComponent(run.sessionId)}` : ''}`

const TITLE = 'Runs'
const SUBTITLE = 'Every run that is yours, in every project and your own space, newest first.'

/**
 * The organisation's Runs (spec D19, the Runs design): every run of the person's, across projects, as one list to
 * search, filter and page, opened from the Runs panel's *All runs ›* and from Workrooms; and one run on its own page.
 * Nothing here creates, so its one button, *Open Workrooms ›*, is outlined. On a phone the Runs are a rail place (☰);
 * one run is a sub-page (‹ Back to the Runs).
 */
export function RunsPage() {
  const { runId } = useParams()
  return runId ? <OneRun runId={runId} /> : <OrgRuns />
}

function OrgRuns() {
  const navigate = useNavigate()
  const { data: settings } = useQuery(getUserSettings)
  const openWorkrooms = () => navigate('/workrooms')
  return (
    <AppLayout
      screenBarEdge
      breadcrumbs={[{ label: TITLE }]} title={TITLE} subtitle={SUBTITLE}
      action={<>{settings?.role === 'ADMIN' && <StopAllRunsButton />}<Button variant="secondary" onClick={openWorkrooms}>Open Workrooms ›</Button></>}
      phoneActions={[{ label: 'Open Workrooms ›', onSelect: openWorkrooms }]}
      mobileHeader={<TopBar leading={<MenuButton />}><TopBarTitle title={TITLE} under="Yours, in every project" /></TopBar>}
    >
      <div className="px-4 pb-6 lg:px-6 max-lg:px-3">
        <RunHistory onOpenRun={row => navigate(runAddress(row))} onOpenTarget={href => navigate(href)} />
      </div>
    </AppLayout>
  )
}

function OneRun({ runId }: { runId: string }) {
  const [params] = useSearchParams()
  const label = useRunLabel(runId, params.get('session')) ?? runLabelOf(null)
  return (
    <AppLayout
      breadcrumbs={[{ label: TITLE, href: '/runs' }, { label: label.crumb }]}
      mobileHeader={<TopBar leading={<BackButton to="/runs" />}><TopBarTitle title={label.title} under={label.under ?? TITLE} /></TopBar>}
    >
      <div className="px-4 lg:px-6 max-lg:px-3">
        <RunView runId={runId} sessionId={params.get('session')} runHref={runAddress} />
      </div>
    </AppLayout>
  )
}
