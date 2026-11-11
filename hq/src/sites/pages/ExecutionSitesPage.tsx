import { useState } from 'react'
import { useQuery, getSiteList } from 'wasp/client/operations'
import { hostingLabel, FOCUS_RING } from '@agenthix/ui/primitives'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { SiteRow } from './SiteRow'
import { RowList, SiteGroupSection } from './SiteGroupSection'
import type { SiteListEntry } from '../siteViews'
import { LOOKED_AFTER_BY_FLEET_ADMINS } from './whereWorkRunsWords'

// A request, a health report or a reconnect changes what an admin should see within seconds.
const REFETCH_INTERVAL = 10_000

/** Organisation › Settings › Where work runs: every site, read-only, Cloud's first. Nothing on it can be changed (spec §10). */
export function ExecutionSitesPage() {
  return (
    <OrgAdminPage area="settings" title="Where work runs" wide>
      <OrgAdminHeading title="Where work runs">
        The sites that run your organisation's agents, and how each is doing. You can see them here; your fleet admins look after them.
      </OrgAdminHeading>
      <SitesList />
      <p className="text-small text-text-muted">{LOOKED_AFTER_BY_FLEET_ADMINS}</p>
    </OrgAdminPage>
  )
}

function SitesList() {
  const { data: sites, isLoading } = useQuery(getSiteList, undefined, { refetchInterval: REFETCH_INTERVAL })
  const [showRemoved, setShowRemoved] = useState(false)

  const live = (sites ?? []).filter((s) => s.group !== 'removed')
  const removed = (sites ?? []).filter((s) => s.group === 'removed')
  const cloud = live.filter((s) => s.hosting === 'cloud')
  const selfHosted = live.filter((s) => s.hosting === 'self-hosted')

  if (isLoading) return <p className="text-text-muted text-body">Loading…</p>
  return (
    <div>
      {sites && !sites.some((s) => s.isDefault) && (
        <p className="text-small text-text-secondary bg-surface-1 border border-border rounded-[10px] px-4 py-3 mb-6">
          HQ has no site of its own. On HQ's machine, <code className="font-mono text-text-primary">agenthix status</code> says why and what to do next.
        </p>
      )}
      {sites && sites.length === 0 ? (
        <div className="p-8 text-center text-text-muted text-body bg-surface-1 border border-border rounded-xl mb-6">No sites yet.</div>
      ) : (
        <>
          {cloud.length > 0 && <Group title={hostingLabel('cloud')} sites={cloud} />}
          {selfHosted.length > 0 && <Group title={hostingLabel('self-hosted')} sites={selfHosted} />}
          {removed.length > 0 && (
            <SiteGroupSection
              title="Removed"
              count={removed.length}
              action={
                <button
                  type="button"
                  aria-expanded={showRemoved}
                  onClick={() => setShowRemoved((v) => !v)}
                  className={`rounded text-micro font-medium text-link hover:underline cursor-pointer ${FOCUS_RING}`}
                >
                  {showRemoved ? 'Hide' : 'Show'}
                </button>
              }
            >
              {showRemoved && <Rows sites={removed} />}
            </SiteGroupSection>
          )}
        </>
      )}
    </div>
  )
}

function Rows({ sites }: { sites: SiteListEntry[] }) {
  return (
    <RowList>
      {sites.map((site) => (
        <SiteRow key={site.id} site={site} />
      ))}
    </RowList>
  )
}

function Group({ title, sites }: { title: string; sites: SiteListEntry[] }) {
  return (
    <SiteGroupSection title={title} count={sites.length}>
      <Rows sites={sites} />
    </SiteGroupSection>
  )
}
