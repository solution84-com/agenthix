import { useState } from 'react'
import { useQuery, useAction, getFeatures, setFeature } from 'wasp/client/operations'
import { FEATURE_STAGES, type FeatureFlag, type FeatureStage } from '@agenthix/core'
import { AutomationSwitch } from '@agenthix/ui/projects'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { FEATURE_WORDS, STAGE_WORDS, type FeaturesAnswer, type FeatureRow } from '../../shared/features'
import { ShowAttention } from '@agenthix/ui/attention'

const day = (at: string) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Who last switched it and when, or what it is with no switch. */
export function changedLine(row: FeatureRow): string {
  if (row.changed) return `Switched ${row.on ? 'on' : 'off'} by ${row.changed.by ?? 'someone no longer here'} on ${day(row.changed.at)}`
  return `${row.onByDefault ? 'On' : 'Off'} by default`
}

/** The flags the screen lists, grouped by stage in order: every flag in a development build, else beta and released. */
export function featureGroups(answer: FeaturesAnswer): Array<{ stage: FeatureStage; rows: FeatureRow[] }> {
  const listed = answer.development ? answer.flags : answer.flags.filter(f => f.shownInProduction)
  return FEATURE_STAGES
    .map(stage => ({ stage, rows: listed.filter(f => f.stage === stage) }))
    .filter(g => g.rows.length > 0)
}

function FeatureRowView({ row, busy, onSwitch }: { row: FeatureRow; busy: boolean; onSwitch: (on: boolean) => void }) {
  const words = FEATURE_WORDS[row.flag]
  return (
    <div className="flex items-start gap-3 py-3" data-testid={`feature-${row.flag}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-body font-medium text-text-primary">{words.title}</span>
          <span className="rounded-full border border-border px-2 text-micro text-text-muted">{STAGE_WORDS[row.stage].label}</span>
        </div>
        <p className="text-small text-text-secondary">{words.line}</p>
        <p className="text-small text-text-muted">{changedLine(row)}</p>
      </div>
      <AutomationSwitch
        on={row.on}
        disabled={busy || !row.switchable}
        label={`${words.title} is ${row.on ? 'on' : 'off'}`}
        onChange={onSwitch}
      />
    </div>
  )
}

/**
 * Organisation › Settings › Features (live preview spec section 7, *The Features screen*): the one place a flagged
 * feature is switched, for the whole organisation. Production lists features in beta and those new in this release; a
 * development build lists every flag by stage, and a developer may switch any.
 */
export function FeaturesPage() {
  const { data } = useQuery(getFeatures)
  const save = useAction(setFeature)
  const [busy, setBusy] = useState<FeatureFlag | null>(null)
  const [error, setError] = useState('')

  async function flip(flag: FeatureFlag, on: boolean) {
    setBusy(flag)
    setError('')
    try { await save({ flag, on }) } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch that. Nothing was changed.')
    } finally { setBusy(null) }
  }

  const groups = data ? featureGroups(data) : []
  const explained: readonly FeatureStage[] = data?.development ? FEATURE_STAGES : ['beta', 'released']
  return (
    <OrgAdminPage area="settings" title="Features">
      <OrgAdminHeading title="Features">
        Features that are not finished, or new in this release. A switch applies to the whole organisation; switching one
        off keeps what it stored.
      </OrgAdminHeading>
      {data && (
        <>
          <dl className="mb-6 space-y-1 text-small" aria-label="What the stages mean">
            {explained.map(stage => (
              <div key={stage}>
                <dt className="inline font-medium text-text-primary">{STAGE_WORDS[stage].label}: </dt>
                <dd className="inline text-text-secondary">{STAGE_WORDS[stage].line}</dd>
              </div>
            ))}
          </dl>
          {data.development && (
            <p className="mb-6 text-small text-text-muted">
              This is a development build: every flag is listed, and your switches stay in this HQ's own database.
            </p>
          )}
          {groups.length === 0 ? (
            <p className="text-body text-text-secondary">There is nothing to try right now: no feature is in beta or new in this release.</p>
          ) : groups.map(g => (
            <section key={g.stage} aria-label={STAGE_WORDS[g.stage].label} className="mb-6">
              <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">{STAGE_WORDS[g.stage].label}</h2>
              <div className="divide-y divide-border-subtle border-y border-border-subtle">
                {g.rows.map(row => (
                  <FeatureRowView key={row.flag} row={row} busy={busy !== null} onSwitch={on => void flip(row.flag, on)} />
                ))}
              </div>
            </section>
          ))}
          <ShowAttention kind="alert" text={error} title="The feature was not changed" onClose={() => setError('')} />
        </>
      )}
    </OrgAdminPage>
  )
}
