import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Archive, Check, ListChecks, MoreHorizontal, Pencil, Pin, Sparkles, Trash2 } from 'lucide-react'

const ITEM = 'flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover disabled:opacity-50 max-lg:min-h-10'

function Words({ icon, label, line }: { icon: ReactNode; label: string; line?: string }) {
  return (
    <>
      <span aria-hidden className="mt-0.5 flex shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {line && <span className="block text-micro text-text-muted">{line}</span>}
      </span>
    </>
  )
}

/**
 * The conversation's menu, each entry with its icon: Rename, Summarise now, Show its runs, Keep it, Archive and
 * Delete…. Only Summarise now and Keep it carry a short line, since the others say what they do.
 */
export function ConversationMenu({ busy, onRename, onSummarise, keep, onToggleKeep, runsHref, onArchive, onDelete }: {
  busy: boolean
  onRename?: () => void
  onSummarise?: () => void
  /** Present where the viewer may choose whether idle archiving may take this conversation. */
  keep?: boolean
  onToggleKeep?: () => void
  runsHref?: string
  onArchive?: () => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])
  const pick = (action: () => void) => () => { setOpen(false); action() }
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
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-60 rounded-lg border border-border bg-surface-1 p-1 shadow-pop">
          {onRename && (
            <button type="button" role="menuitem" onClick={pick(onRename)} className={ITEM}>
              <Words icon={<Pencil size={14} />} label="Rename" />
            </button>
          )}
          {onSummarise && (
            <button type="button" role="menuitem" disabled={busy} onClick={pick(onSummarise)} className={ITEM}>
              <Words icon={<Sparkles size={14} />} label={busy ? 'Summarising…' : 'Summarise now'} line="Folds the older messages into a short summary" />
            </button>
          )}
          {runsHref && (
            <Link to={runsHref} role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
              <Words icon={<ListChecks size={14} />} label="Show its runs" />
            </Link>
          )}
          {onToggleKeep && (
            <button type="button" role="menuitemcheckbox" aria-checked={!!keep} onClick={pick(onToggleKeep)} className={ITEM}>
              <Words icon={<Pin size={14} />} label="Keep it" line={keep ? 'Kept out of archiving when idle' : 'Keeps it out of archiving when idle'} />
              {keep && <Check size={14} aria-hidden className="mt-0.5 shrink-0 text-accent" />}
            </button>
          )}
          {onArchive && (
            <button type="button" role="menuitem" onClick={pick(onArchive)} className={ITEM}>
              <Words icon={<Archive size={14} />} label="Archive" />
            </button>
          )}
          {onDelete && (
            <>
              <div role="separator" className="my-1 border-t border-border-subtle" />
              <button type="button" role="menuitem" onClick={pick(onDelete)} className={`${ITEM} text-danger`}>
                <Words icon={<Trash2 size={14} />} label="Delete…" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
