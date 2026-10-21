import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { DiagnosticsHealth } from '../operations'
import type { HqHealth } from '../hqHealth'
import type { SiteHealthCard } from '../siteHealthCards'
import { bytesText, clock, plural, problemText } from './diagnosticsWords'
import { dayText } from '../../sites/pages/siteWords'

const CARD = 'flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-4 hover:bg-surface-hover transition-colors'

function Card({ to, title, state, tone, line }: { to: string; title: string; state: string; tone: 'ok' | 'attention' | 'quiet'; line: string }) {
  const toneClass = tone === 'attention' ? 'text-warning' : tone === 'ok' ? 'text-success' : 'text-text-muted'
  return (
    <Link to={to} className={CARD}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-body font-medium text-text-primary">{title}</span>
          <span className={`text-small ${toneClass}`}>{state}</span>
        </div>
        <div className="text-small text-text-muted">{line}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
    </Link>
  )
}

function HqCard({ hq }: { hq: HqHealth }) {
  const tick = hq.schedulerLastTick
  const facts = [
    hq.databaseAnswers ? 'Database answering' : 'Database not answering',
    tick ? `scheduler ${tick.ok ? 'ran' : 'failed at'} ${clock(tick.at)}` : 'scheduler has not run yet',
    `${plural(hq.sitesKnown, 'site')} known`,
  ]
  return (
    <Card
      to="/org/infrastructure/hq"
      title="HQ"
      state={`Running since ${dayText(hq.runningSince)} · ${hq.version}`}
      tone={hq.databaseAnswers && (!tick || tick.ok) ? 'ok' : 'attention'}
      line={facts.join(' · ')}
    />
  )
}

function siteState(site: SiteHealthCard): { state: string; tone: 'ok' | 'attention' | 'quiet' } {
  const problem = site.problems[0]
  if (problem) return { state: problemText(problem), tone: 'attention' }
  if (!site.connected) return { state: 'Not connected', tone: 'quiet' }
  const runs = site.health?.runs
  return { state: runs ? `Running · ${runs.running} of ${runs.maxAtOnce} runs` : 'Running', tone: 'ok' }
}

function siteLine(site: SiteHealthCard): string {
  const parts: string[] = []
  const h = site.health
  if (h) {
    parts.push(h.docker.running ? 'Docker running' : 'Docker not running')
    if (h.disk) parts.push(`disk ${bytesText(h.disk.freeBytes)} free`)
  } else {
    parts.push(site.connected ? 'No health report yet' : 'No health report to show')
  }
  if (site.runStore === 'no-answer') parts.push(site.runStoreDetail ?? 'its run store does not answer')
  if (!site.connected && site.healthReportedAt) parts.push(`last report ${clock(site.healthReportedAt)}`)
  return parts.join(' · ')
}

export function HealthCards({ data }: { data: DiagnosticsHealth }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <HqCard hq={data.hq} />
      {data.sites.map(site => {
        const { state, tone } = siteState(site)
        return (
          <Card
            key={site.executionSiteId}
            to={`/org/settings/where-work-runs/${site.executionSiteId}`}
            title={site.label}
            state={state}
            tone={tone}
            line={siteLine(site)}
          />
        )
      })}
    </div>
  )
}
