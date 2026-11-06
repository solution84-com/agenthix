import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export interface OverflowItem {
  label: string
  onSelect: () => void | Promise<void>
  danger?: boolean
  /** Asks again before doing it: the label the second click shows. */
  confirmLabel?: string
  /** A line under the label saying what it does. */
  hint?: string
  /** Greyed, with why in its tooltip: a refusal known in advance. */
  disabledReason?: string
  /** A rule above it, setting it apart from the items before. */
  separatorBefore?: boolean
}

/** "⋯": the actions a task rarely needs, behind one button. */
export function OverflowMenu({ items, label = 'More actions' }: { items: OverflowItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setConfirming(null)
      button.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (items.length === 0) return null
  const close = () => { setOpen(false); setConfirming(null) }
  // The reason an action was refused is said beside the button, not lost.
  const select = (item: OverflowItem) => {
    setFailure(null)
    const refused = (err: unknown) => setFailure(err instanceof Error && err.message ? err.message : `${item.label} did not work. Nothing was changed.`)
    try {
      void Promise.resolve(item.onSelect()).catch(refused)
    } catch (err) {
      refused(err)
    }
  }
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={close} />}
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setFailure(null); if (open) close(); else setOpen(true) }}
        className="rounded-lg border border-border bg-surface-1 p-1.5 text-text-secondary hover:bg-surface-hover"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {failure && !open && (
        <div role="alert" className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-danger/30 bg-surface-1 px-3 py-2 text-small text-danger shadow-lg">
          {failure}
        </div>
      )}
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={!!item.disabledReason}
              aria-disabled={item.disabledReason ? true : undefined}
              title={item.disabledReason}
              onClick={() => {
                if (item.confirmLabel && confirming !== item.label) { setConfirming(item.label); return }
                close()
                select(item)
              }}
              className={`block w-full px-3 py-2 text-left text-small hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${item.danger ? 'text-danger' : 'text-text-primary'} ${item.separatorBefore ? 'border-t border-border-subtle' : ''}`}
            >
              {confirming === item.label && item.confirmLabel ? item.confirmLabel : item.label}
              {item.hint && <span className="block text-micro text-text-muted">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
