import { useQuery, getMemoryMeasurements } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../../org/pages/OrgAdminPage'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { reliedOnShare } from './memoryFormat'

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="text-h2 font-medium text-text-primary">{value}</div>
      <div className="text-small text-text-secondary">{label}</div>
    </div>
  )
}

/** Organisation › Settings › Memory: how recall has done over the last 30 days. */
export function MemorySettingsPage() {
  const query = useQuery(getMemoryMeasurements)
  const { data: m } = query
  const read = useBackgroundRead(query, { what: 'The figures' })
  const share = m ? reliedOnShare(m) : null

  return (
    <OrgAdminPage area="settings" title="Memory">
      <OrgAdminHeading title="Memory">How well agents remember.</OrgAdminHeading>
      {!m ? (read.failedWithoutData ? read.nudge : <p className="text-body text-text-muted">Loading…</p>) : (
        <>
          {read.nudge}
          <section aria-labelledby="memory-recall" className="mb-8">
            <h2 id="memory-recall" className="text-h3 font-medium text-text-primary">Recall, last 30 days</h2>
            <p className="mt-0.5 mb-4 text-small text-text-secondary">
              {share === null ? 'Nothing has been judged yet.' : `Agents relied on ${share}% of the memories they were given.`}
              {` Recall tuning: certain at ${m.certainBar}, probable at ${m.probableBar}.`}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Figure label="Included in a reply" value={m.included} />
              <Figure label="Named as a hint" value={m.hinted} />
              <Figure label="Recalled on request" value={m.recalled} />
              <Figure label="Relied on" value={m.used} />
              <Figure label="Not relied on" value={m.unused} />
              <Figure label="Missed" value={m.missed} />
            </div>
          </section>
        </>
      )}
    </OrgAdminPage>
  )
}
