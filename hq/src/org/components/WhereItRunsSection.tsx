import { Link } from 'react-router'
import { useQuery, getSiteList } from 'wasp/client/operations'
import type { SiteListEntry } from '../../sites/siteViews'
import { bytesText, FLEET_ADMINS_ADD_SITES, plural } from '../../sites/pages/siteWords'
import { availability } from '../../sites/pages/whereWorkRunsWords'
import { TONE_CLASS } from '../../sites/pages/SiteRow'
import { CardGrid, Meter, OrgGroupHeading } from './orgCardParts'

function SiteCard({ site }: { site: SiteListEntry }) {
  const state = availability(site)
  const h = site.health
  const load = site.load
  const diskFull = site.problems.some(p => p.kind === 'diskNearlyFull')
  const dockerDown = site.problems.some(p => p.kind === 'dockerDown') || (h !== null && !h.docker.running)
  return (
    <Link
      to={`/org/settings/where-work-runs/${site.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-1 transition-colors hover:border-accent"
    >
      <div className="relative h-14 rounded-t-2xl" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 25%, var(--color-surface-2)) 0%, var(--color-surface-3) 100%)' }}>
        <span className="absolute -bottom-0 left-4 flex h-9 w-9 translate-y-1/2 items-center justify-center rounded-xl bg-surface-1 text-small font-semibold text-accent ring-2 ring-surface-1">
          {site.label.trim().slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4 pt-7">
        <div className="flex items-baseline justify-between gap-2">
          <b className="min-w-0 truncate text-body text-text-primary">{site.label}</b>
          <span className={`shrink-0 text-small ${TONE_CLASS[state.tone]}`}>{state.word}</span>
        </div>
        <div className="text-small text-text-muted">
          {[site.isDefault ? 'This machine' : null, plural(site.projectCount, 'project')].filter(Boolean).join(' · ')}
        </div>
        {load ? (
          <>
            <Meter label="Runs" share={load.maxAtOnce > 0 ? (load.running / load.maxAtOnce) * 100 : 0} value={`${load.running} of ${load.maxAtOnce}`} />
            {/* The machine's figures are a fleet admin's, sent only to one (spec §10); the rest read the state above. */}
            {h?.disk && <Meter label="Disk" share={(1 - h.disk.freeBytes / h.disk.totalBytes) * 100} value={`${bytesText(h.disk.freeBytes)} free`} warn={diskFull} />}
            {h && <Meter label="Docker" share={dockerDown ? 0 : 100} value={dockerDown ? 'Not running' : 'Ready'} warn={dockerDown} />}
          </>
        ) : (
          <p className="text-small text-text-muted">Has not reported its health.</p>
        )}
      </div>
    </Link>
  )
}

/** Where it runs (every screen reviewed spec §3, Organisation), for admins: each site as a card, from the health the Execution Sites screens read. */
export function WhereItRunsSection() {
  const { data: sites } = useQuery(getSiteList, undefined, { refetchInterval: 30_000 })
  const shown = (sites ?? []).filter(s => s.group !== 'removed')
  return (
    <section aria-label="Where it runs">
      <OrgGroupHeading
        title={`Where it runs${sites ? ` · ${plural(shown.length, 'site')}` : ''}`}
        aside={<Link to="/org/infrastructure" className="text-accent hover:text-accent-hover">Infrastructure ›</Link>}
      />
      <CardGrid>
        {shown.map(site => <SiteCard key={site.id} site={site} />)}
      </CardGrid>
      <p className="mt-3 text-small text-text-muted">{FLEET_ADMINS_ADD_SITES}</p>
    </section>
  )
}
