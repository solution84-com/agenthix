import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Archive, ListChecks, MoreHorizontal, Sparkles } from 'lucide-react'

const ITEM = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover disabled:opacity-50 max-lg:min-h-10'

/**
 * The conversation's menu: Summarise now, which folds the older messages into a summary at once; Keep out of
 * archiving; and Show its runs, which opens the Runs screen on this conversation.
 */
export function ConversationMenu({ busy, onSummarise, keep, onToggleKeep, runsHref }: {
  busy: boolean
  onSummarise?: () => void
  /** Present where the viewer may choose whether idle archiving may take this conversation. */
  keep?: boolean
  onToggleKeep?: () => void
  runsHref?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Conversation menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center rounded-md p-1 text-text-muted hover:text-text-primary max-lg:min-h-10 max-lg:min-w-10 max-lg:justify-center"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-44 rounded-lg border border-border bg-surface-1 p-1 shadow-pop">
          {onSummarise && (
            <button type="button" role="menuitem" disabled={busy} onClick={() => { setOpen(false); onSummarise() }} className={ITEM}>
              <Sparkles size={14} aria-hidden />
              {busy ? 'Summarising…' : 'Summarise now'}
            </button>
          )}
          {onToggleKeep && (
            <button type="button" role="menuitemcheckbox" aria-checked={!!keep} onClick={() => { setOpen(false); onToggleKeep() }} className={ITEM}>
              <Archive size={14} aria-hidden />
              {keep ? 'Allow archiving when idle' : 'Keep out of archiving'}
            </button>
          )}
          {runsHref && (
            <Link to={runsHref} role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
              <ListChecks size={14} aria-hidden />
              Show its runs
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
