import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/** One quiet line that opens in place: the work line, an answered approval, a failed or stopped run. */
export function FoldedLine({ label, children, defaultOpen = false, tone = 'secondary' }: {
  label: ReactNode
  children?: ReactNode
  defaultOpen?: boolean
  tone?: 'secondary' | 'danger'
}) {
  const [open, setOpen] = useState(defaultOpen)
  const openable = children !== undefined && children !== null && children !== false
  return (
    <div className="text-small">
      <button
        type="button"
        onClick={() => openable && setOpen(v => !v)}
        aria-expanded={openable ? open : undefined}
        className={`flex min-h-6 w-full items-start gap-1.5 py-0.5 text-left max-lg:min-h-10 max-lg:items-center ${tone === 'danger' ? 'text-danger' : 'text-text-secondary'} ${openable ? 'cursor-pointer hover:text-text-primary' : 'cursor-default'}`}
      >
        {openable && (open ? <ChevronDown size={12} className="mt-1 shrink-0 text-text-muted max-lg:mt-0" /> : <ChevronRight size={12} className="mt-1 shrink-0 text-text-muted max-lg:mt-0" />)}
        <span className="min-w-0 flex-1">{label}</span>
      </button>
      {open && openable && <div className="mt-1 border-l border-border-subtle pl-3">{children}</div>}
    </div>
  )
}
