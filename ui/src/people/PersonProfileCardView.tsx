import { useEffect, useRef, type ReactNode } from 'react'
import { orgRoleLabel, localTimeBeside, projectRoleLabel } from './personLines'
import { tasksLine } from '../agents/agentNowLines'
import type { PersonCardData } from './types'

export interface PersonProfileCardViewProps {
  card: PersonCardData
  avatar: ReactNode
  at: Date
  /** Present when the card was opened inside a project both are in: it opens that project's Tasks. */
  onShowTasks?: () => void
  /** Present for organisation admins. */
  onManage?: () => void
  onClose: () => void
}

/**
 * A person's profile card (every screen reviewed spec §3, People): who they are, their local time beside the
 * viewer's, the projects the two share, and their role and tasks in the project it was opened in.
 * Opens over the screen; Escape and a click outside close it.
 */
export function PersonProfileCardView(p: PersonProfileCardViewProps) {
  const first = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  // An inline `onClose` is a new function on every render: the effect below must not re-run (and re-focus) for it.
  const onClose = useRef(p.onClose)
  onClose.current = p.onClose
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = dialog.current
    if (first.current) first.current.focus()
    else root?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose.current(); return }
      if (e.key !== 'Tab' || !root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      if (items.length === 0) { e.preventDefault(); root.focus(); return }
      const active = document.activeElement
      if (!root.contains(active) || (!e.shiftKey && active === items[items.length - 1])) { e.preventDefault(); items[0].focus() }
      else if (e.shiftKey && (active === items[0] || active === root)) { e.preventDefault(); items[items.length - 1].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  const { card } = p
  const { person } = card
  const time = localTimeBeside(card.timezone, card.viewerTimezone, p.at)
  const rows: [string, string][] = []
  if (time) rows.push(['Local time', time])
  if (!card.isMe && card.sharedProjects.length > 0) rows.push(['You share', card.sharedProjects.map(x => x.name).join(' · ')])
  if (card.here) rows.push(['Here', `${projectRoleLabel(card.here.role)} · ${tasksLine(card.here.tasks).toLowerCase()}`])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim" onClick={p.onClose} data-testid="profile-card-scrim" />
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${person.name}, profile`} className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-2xl">
        <div className="h-16 bg-accent-subtle" />
        <div className="space-y-3 px-5 pb-5">
          <div className="-mt-7 w-fit rounded-full border-2 border-surface-1">{p.avatar}</div>
          <div>
            <p className="text-h3 font-semibold text-text-primary">{person.name}</p>
            <p className="text-small text-text-muted">
              {[person.handle ? `@${person.handle}` : null, person.state === 'erased' ? null : `${orgRoleLabel(card.orgRole)} of the organisation`].filter(Boolean).join(' · ')}
            </p>
            {person.state === 'left' && <p className="text-small text-text-muted">Left the organisation</p>}
          </div>
          {rows.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
              {rows.map(([label, value]) => (
                <div key={label} className="contents"><dt className="text-text-muted">{label}</dt><dd className="min-w-0 text-text-primary">{value}</dd></div>
              ))}
            </dl>
          )}
          {(p.onShowTasks || p.onManage) && (
            <div className="flex gap-2 pt-1">
              {p.onShowTasks && (
                <button ref={first} type="button" onClick={p.onShowTasks} className="rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-on-accent hover:bg-accent-hover">
                  {card.isMe ? 'Show my tasks' : 'Show their tasks'}
                </button>
              )}
              {p.onManage && (
                <button type="button" onClick={p.onManage} className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-small font-medium text-text-primary hover:bg-surface-hover">Manage ›</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
