import { useParams } from 'react-router'
import { useQuery, getSiteDetail } from 'wasp/client/operations'
import { HostingBadge } from '@agenthix/ui/primitives'
import { ReadFailure, isFinal, useBackgroundRead } from '@agenthix/ui/attention'
import { OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { About, Limits, MachineFigures, Now, OnIt, ScheduledChanges, WhatThisStops, WhyNotConnected } from './SiteSections'
import { TONE_CLASS, browserZone } from './SiteRow'
import { availability, LOOKED_AFTER_BY_FLEET_ADMINS, pageSentence } from './whereWorkRunsWords'
import { plural } from './siteWords'
import type { SiteDetail } from '../siteViews'

const REFETCH_INTERVAL = 10_000

/** Organisation › Settings › Where work runs › one site: how it is doing, what is going and waiting, what each run gets. Read-only; the page says who acts. */
export function SitePage() {
  const { executionSiteId } = useParams()
  const query = useQuery(getSiteDetail, { executionSiteId: executionSiteId ?? '' }, { refetchInterval: REFETCH_INTERVAL })
  const site = query.data
  const read = useBackgroundRead(query, { what: 'The site', pollMs: REFETCH_INTERVAL })
  // Not found is final, in its own words; anything else was retried quietly and offers Try again.
  const failed = read.failedWithoutData && (isFinal(query.error) ? <ReadFailure what="The site" final="This site could not be found." /> : read.nudge)
  return (
    <OrgAdminPage
      area="settings"
      title={site?.label ?? 'Site'}
      trail={[{ label: 'Where work runs', href: '/admin/where-work-runs' }]}
      wide
    >
      {site ? <>{read.nudge && <div className="mb-3">{read.nudge}</div>}<SiteBody site={site} /></> : failed || <p className="text-body text-text-muted">Loading…</p>}
    </OrgAdminPage>
  )
}

function SiteBody({ site }: { site: SiteDetail }) {
  const removed = site.group === 'removed' || site.removal !== null
  const state = availability(site)
  const away = !site.connected && !removed
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-h1 font-medium text-text-primary">{site.label}</h1>
          <HostingBadge where={site.hosting} short />
        </div>
        <p className={`mt-0.5 text-small ${TONE_CLASS[state.tone]}`}>{pageSentence(site)}</p>
      </div>

      {away && site.isDefault && <WhyNotConnected site={site} />}
      {away && site.isDefault ? (
        <WhatThisStops site={site} />
      ) : (
        <>
          <Now site={site} />
          <Limits site={site} />
          <OnIt site={site} />
        </>
      )}
      {!removed && <MachineFigures site={site} />}
      {!removed && <ScheduledChanges site={site} zone={browserZone()} />}
      <About site={site} />
      {removed && site.projectCount > 0 && (
        <p className="mb-6 text-small text-text-secondary">{plural(site.projectCount, 'project')} still placed here stay stopped until moved to another site.</p>
      )}
      <p className="text-small text-text-muted">{LOOKED_AFTER_BY_FLEET_ADMINS}</p>
    </div>
  )
}
