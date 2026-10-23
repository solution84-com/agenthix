import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { HostingBadge } from '@agenthix/ui/primitives'
import type { SiteListEntry } from '../siteViews'
import type { Tone } from './siteWords'
import { availability, figureFacts, loadText, rowDetail } from './whereWorkRunsWords'

export const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-success',
  attention: 'text-warning',
  quiet: 'text-text-muted',
}

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** One site on Where work runs: its name alone, then a sentence that starts with its state and goes on to what it holds and gets; its hosting, word and runs on the right. It opens the site's page. */
export function SiteRow({ site }: { site: SiteListEntry }) {
  const state = availability(site)
  const load = loadText(site)
  const detail = rowDetail(site, browserZone())
  return (
    <Link
      to={`/admin/where-work-runs/${site.id}`}
      data-testid="site-row"
      className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors"
    >
      <div className="min-w-0 flex-1">
        <span data-testid="site-name" className="block text-small font-medium text-text-primary">{site.label}</span>
        <p data-testid="site-sentence" className="text-small text-text-muted mt-0.5">
          <span className={TONE_CLASS[state.tone]}>{state.sentence}</span>
          {detail && ` · ${detail}`}
        </p>
        {site.figures && <p className="text-small text-text-muted">{figureFacts(site).map((f) => `${f.label.toLowerCase()} ${f.text}`).join(' · ')}</p>}
      </div>
      <div className="shrink-0 text-right">
        <div className="flex items-center justify-end gap-2">
          <HostingBadge where={site.hosting} short />
          <span className={`text-small font-medium ${TONE_CLASS[state.tone]}`}>{state.word}</span>
        </div>
        {load && <p className="text-micro text-text-muted mt-0.5">{load.runs}{load.waiting ? ` · ${load.waiting}` : ''}</p>}
      </div>
      <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
    </Link>
  )
}
