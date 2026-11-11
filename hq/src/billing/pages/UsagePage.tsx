import { useState } from 'react'
import { useQuery, getBillingProfiles, getUsageReport } from 'wasp/client/operations'
import { Button, NativeSelect } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { TimeZoneControl } from '../components/TimeZoneControl'
import { UsageTable } from '../components/UsageTable'
import { monthWords, shiftMonth } from '../components/costWords'
import type { ReportGroup } from '../report'
import { ReadFailure } from '@agenthix/ui/attention'

const GROUPS: { value: ReportGroup; label: string }[] = [
  { value: 'profile', label: 'By billing profile' }, { value: 'project', label: 'By project' },
  { value: 'agent', label: 'By agent' }, { value: 'person', label: 'By person' },
]

function Report({ month, currentMonth, onMonth }: { month: string; currentMonth: string; onMonth: (m: string) => void }) {
  const [group, setGroup] = useState<ReportGroup>('profile')
  const [profile, setProfile] = useState('')
  const { data: profiles, refetch: refetchProfiles } = useQuery(getBillingProfiles)
  const { data, error, refetch } = useQuery(getUsageReport, { month, groupBy: group, ...(profile ? { billingProfileId: profile } : {}) })
  const changed = () => { void refetch(); void refetchProfiles() }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-medium text-text-primary">Usage · {monthWords(month)}</h1>
          <p className="mt-0.5 text-small text-text-secondary">What the organisation&rsquo;s AI use cost, and who used it. Each currency and each kind of figure is kept apart, never added together.</p>
        </div>
        <ExportCsvButton month={month} billingProfileId={profile} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}>‹</Button>
        <span className="text-body text-text-primary">{monthWords(month)}</span>
        <Button size="sm" variant="ghost" aria-label="Next month" disabled={month >= currentMonth} onClick={() => onMonth(shiftMonth(month, 1))}>›</Button>
        <NativeSelect size="sm" className="w-auto" aria-label="Group by" value={group} onChange={e => setGroup(e.target.value as ReportGroup)}>
          {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </NativeSelect>
        {profiles && profiles.profiles.length > 1 && (
          <NativeSelect size="sm" className="w-auto" aria-label="Billing profile" value={profile} onChange={e => setProfile(e.target.value)}>
            <option value="">All billing profiles</option>
            {profiles.profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.archivedAt ? ' (archived)' : ''}</option>)}
          </NativeSelect>
        )}
      </div>
      {data && <TimeZoneControl timeZone={data.timeZone} onChanged={changed} />}

      {error && <ReadFailure what="The usage" retry={() => void refetch()} />}
      {!data && !error && <p className="mt-6 text-small text-text-muted">Loading…</p>}
      {data && <UsageTable rows={data.rows} group={group} />}
    </>
  )
}

/** The month's cost by billing profile, project, agent and person. Organisation admins only; the server refuses anyone else. */
export function UsagePage() {
  const { data: profiles, error, refetch } = useQuery(getBillingProfiles)
  const [month, setMonth] = useState<string | null>(null)
  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation', href: '/admin' }, { label: 'Usage' }]}>
      <div className="max-w-[1000px] px-4 py-9 lg:px-10">
        {error && <ReadFailure what="The billing profiles" retry={() => void refetch()} />}
        {!profiles && !error && <p className="text-small text-text-muted">Loading…</p>}
        {profiles && <Report month={month ?? profiles.month} currentMonth={profiles.month} onMonth={setMonth} />}
      </div>
    </AppLayout>
  )
}
