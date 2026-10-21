import type { CloudOrganisationConnection, CloudSiteSummary } from '@agenthix/core'
import { HqLink } from '../components'
import { possessive, spanOf, whenIs } from '../pages/dashboard/words'
import { CloudMark } from './CloudMark'
import { CLOUD } from './words'

/** The hero's fact about the organisation's connection to Cloud, on a self-hosted HQ (board *Fleet*). */
export function cloudConnectionWords(organisation: CloudOrganisationConnection | null): string {
  return organisation ? `Connected as ${organisation.name}` : 'Not connected'
}

/**
 * HQ at the top of the Fleet screen when Cloud runs it (board *Fleet*, *hq on Agenthix Cloud*): Cloud's mark and the
 * Cloud machine it runs on, which the Cloud group then leaves out.
 */
export function CloudHqHero({ site, org, address, now }: { site: CloudSiteSummary; org: string | null; address: string | null; now: Date }) {
  const hq = site.figures?.installs.find(i => i.target === 'hq')
  const backup = site.figures?.backups.lastNightlyAt
  return (
    <section aria-label="HQ" className="mb-5 rounded-2xl border border-border-strong bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-h2 font-bold text-text-primary">{org ? `${possessive(org)} HQ` : 'HQ'}</h2>
        <CloudMark />
        <span className="text-small text-text-secondary">· <b className="font-semibold text-text-primary">{site.machineName}</b></span>
        {address && <span className="ml-auto"><HqLink address={address}>Open HQ ↗</HqLink></span>}
      </div>
      <p className="mt-1 text-small text-text-secondary">
        {address && <><span className="font-mono text-[.92em] text-text-primary">{address}</span> · </>}
        {site.problem ?? (hq ? `Healthy, up ${spanOf(hq.since, now)}` : 'Figures from Cloud')}
      </p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-3 text-small text-text-primary">
        <p><span className="block text-micro font-semibold uppercase tracking-[.06em] text-text-muted">Version</span>{hq?.version ?? '—'} · Cloud applies fixes</p>
        <p><span className="block text-micro font-semibold uppercase tracking-[.06em] text-text-muted">Last backup</span>{backup ? `${whenIs(backup, now)}, kept by Cloud` : 'Kept by Cloud'}</p>
        <p><span className="block text-micro font-semibold uppercase tracking-[.06em] text-text-muted">{CLOUD}</span>Runs this HQ{org ? ` for ${org}` : ''}</p>
      </div>
    </section>
  )
}
