import type { CloudSiteSummary } from '@agenthix/core'
import { HostingBadge, StatePill } from '@agenthix/ui/primitives'
import { Link } from '../router'
import { Meter } from '../pages/dashboard/Meter'
import { diskUsedPercent, memoryUsedPercent, NEAR_CAPACITY, spanOf } from '../pages/dashboard/words'

export const cloudSitePath = (siteName: string) => `/fleet/cloud/${encodeURIComponent(siteName)}`

export function cloudSiteHealth(site: CloudSiteSummary): { tone: 'healthy' | 'warning'; label: string } {
  return site.healthy ? { tone: 'healthy', label: 'Healthy' } : { tone: 'warning', label: 'Needs attention' }
}

/** A site Cloud runs, as Cloud's API gave it: figures only, and Cloud applies its fixes (board *Fleet*). */
export function CloudSiteCard({ site, now }: { site: CloudSiteSummary; now: Date }) {
  const f = site.figures
  const health = cloudSiteHealth(site)
  const up = f?.installs.find(i => i.target === 'site')
  const disk = f ? diskUsedPercent(f) : null
  const memory = f ? memoryUsedPercent(f) : null
  const agents = site.agents
  return (
    <article aria-label={site.siteName} className="flex flex-col gap-2 rounded-[14px] border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-h3 font-semibold text-text-primary">
          <Link to={cloudSitePath(site.siteName)} className="hover:underline">{site.siteName}</Link>
        </h3>
        <StatePill tone={health.tone}>{health.label}</StatePill>
      </div>
      <div className="flex items-center gap-1.5 text-small text-text-secondary">
        <HostingBadge where="cloud" short /> on Cloud's machine
      </div>
      <p className="text-small text-text-secondary">
        {site.problem ?? (up ? `Up ${spanOf(up.since, now)}.` : '')} Figures from Cloud.
      </p>
      {f && (
        <div className="flex flex-col gap-1">
          <Meter
            label="Agents"
            value={agents && agents.maxAtOnce > 0 ? Math.round((agents.running / agents.maxAtOnce) * 100) : null}
            text={agents ? `${agents.running} of ${agents.maxAtOnce}` : '—'}
          />
          <Meter label="Disk" value={disk} text={`${disk}% used`} warn={(disk ?? 0) >= NEAR_CAPACITY} />
          <Meter label="Memory" value={memory} text={`${memory}% used`} warn={(memory ?? 0) >= NEAR_CAPACITY} />
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-text-muted">
        <span>{[up?.version, site.region].filter(Boolean).join(' · ')}</span>
        <span>Cloud applies fixes</span>
      </div>
    </article>
  )
}
