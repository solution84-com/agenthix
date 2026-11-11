import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import { Notice } from '../components'
import { whenIs } from '../pages/dashboard/words'
import { Link } from '../router'
import { DismissAll } from './DismissAll'
import { dismissNotice, targetPath, type FleetNoticeView } from './notices'
import { useShellPanel } from './useShellPanel'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The notices, beside the menu and over the page (as HQ's notifications): each opens what it is about, each can be
 * dismissed, or all at once. Escape, the close button or a click outside closes it; on a small screen it fills it.
 */
export function NoticesPanel({ notices }: { notices: FleetNoticeView[] }) {
  const { close } = useShellPanel()
  const now = new Date()
  const dismissible = notices.filter(n => n.dismissible).map(n => n.id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <section id="notices-panel" role="dialog" aria-label="Notices" className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="flex-1 text-h3 font-semibold text-text-primary">{`Notices${notices.length ? ` · ${notices.length}` : ''}`}</h2>
        <button type="button" onClick={close} aria-label="Close notices" className="grid size-7 place-items-center rounded-lg text-text-muted hover:bg-surface-hover">
          <X size={15} aria-hidden />
        </button>
      </header>
      {dismissible.length > 0 && <div className="flex-none border-b border-border-subtle px-4 py-2"><DismissAll ids={dismissible} /></div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {notices.length === 0
          ? <EmptyState variant="inline" title="Nothing needs you." hint="Notices about the sites, HQ and the fleet admins appear here until you dismiss them." />
          : <ul aria-label="Notices">{notices.map(n => <NoticeItem key={n.id} notice={n} now={now} />)}</ul>}
      </div>
    </section>
  )
}

function NoticeItem({ notice: n, now }: { notice: FleetNoticeView; now: Date }) {
  const [refusal, setRefusal] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const to = targetPath(n.target)
  const dismiss = () => {
    setRefusal(null)
    setWorking(true)
    dismissNotice(n.id)
      .catch((err: unknown) => setRefusal(err instanceof Error ? err.message : String(err)))
      .finally(() => setWorking(false))
  }
  const words = (
    <>
      <span className="block font-semibold text-text-primary">{n.title}</span>
      {n.body && <span className="block text-small text-text-secondary">{n.body}</span>}
      <span className="mt-0.5 block text-micro text-text-muted">
        {capital(whenIs(n.at, now))}
        {!n.dismissible && ' · Clears itself once the machine is back, or removed.'}
      </span>
    </>
  )
  return (
    <li className="border-b border-border-subtle py-1 last:border-0">
      <article aria-label={n.title} className="flex items-start gap-2">
        {to
          ? <Link to={to} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-small hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">{words}</Link>
          : <div className="min-w-0 flex-1 px-2 py-1.5 text-small">{words}</div>}
        {n.dismissible && <Button variant="secondary" size="sm" className="mt-1.5 flex-none" disabled={working} onClick={dismiss}>Dismiss</Button>}
      </article>
      {refusal && <Notice kind="alert" title="Not dismissed">{refusal}</Notice>}
    </li>
  )
}
