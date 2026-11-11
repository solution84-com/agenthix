import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, getDiagnosticsHealth, checkDiagnosticsHealthNow, getRecentErrors } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import type { DiagnosticsHealth } from '../operations'
import { HealthCards } from './HealthCards'
import { RecentErrorsList } from './RecentErrors'
import { FleetAdminOnly } from './FleetAdminOnly'
import { clock, errorMessage } from './diagnosticsWords'
import { BUTTON } from './styles'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

const REFETCH_INTERVAL = 15_000

/** Organisation › Infrastructure › Logs and diagnostics: what is wrong, and what HQ and its sites have recorded. */
export function DiagnosticsPage() {
  return (
    <OrgAdminPage area="infrastructure" title="Logs and diagnostics" wide>
      <OrgAdminHeading title="Logs and diagnostics">What is wrong, and what HQ and its sites have recorded.</OrgAdminHeading>
      <DiagnosticsBody />
    </OrgAdminPage>
  )
}

function DiagnosticsBody() {
  const [range, setRange] = useState<'24h' | '7d'>('24h')
  const { data: errors } = useQuery(getRecentErrors, { range }, { refetchInterval: REFETCH_INTERVAL })
  return (
    <div className="space-y-10">
      <section aria-label="Health">
        <FleetAdminOnly what="Each machine's figures and versions"><HealthSection /></FleetAdminOnly>
      </section>

      <section aria-label="Recent errors">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h2 font-medium text-text-primary">
            Recent errors <span className="text-small font-normal text-text-muted">· {range === '24h' ? 'last 24 hours' : 'last 7 days'}</span>
          </h2>
          <button type="button" className={BUTTON} onClick={() => setRange(range === '24h' ? '7d' : '24h')}>
            {range === '24h' ? 'All · last 7 days' : 'Last 24 hours'}
          </button>
        </div>
        {errors ? <RecentErrorsList groups={errors.groups} range={range} /> : <p className="text-body text-text-muted">Loading…</p>}
      </section>

      <FleetAdminOnly what="Logs and the support bundle">
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/infrastructure/diagnostics/logs" className={BUTTON}>Logs</Link>
          <Link to="/admin/infrastructure/diagnostics/bundle" className={BUTTON}>Download support bundle</Link>
        </div>
      </FleetAdminOnly>
    </div>
  )
}

function HealthSection() {
  const [checked, setChecked] = useState<DiagnosticsHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { data: polled, error: healthError, refetch: refetchHealth } = useQuery(getDiagnosticsHealth, undefined, { refetchInterval: REFETCH_INTERVAL })

  // The newest answer wins: a check just made, or the poll that came after it.
  const health = checked && (!polled || checked.checkedAt > polled.checkedAt) ? checked : polled

  async function checkAgain() {
    setChecking(true)
    setNote(null)
    try {
      setChecked(await checkDiagnosticsHealthNow())
      refetchHealth()
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2 font-medium text-text-primary">
          Health now {health && <span className="text-small font-normal text-text-muted">checked {clock(health.checkedAt)}</span>}
        </h2>
        <button type="button" className={BUTTON} onClick={checkAgain} disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
      <ShowAttention kind="alert" text={note} title="The check did not finish" onClose={() => setNote(null)} />
      {health ? <HealthCards data={health} /> : healthError ? <ReadFailure what="Health" retry={() => void refetchHealth()} /> : <p className="text-body text-text-muted">Loading…</p>}
    </>
  )
}
