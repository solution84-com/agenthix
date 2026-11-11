/** The side column's headings (Tuning, Lab, Log): a quiet bar with the section's name and its own small buttons; Tuning and Lab fold away to leave room for the Log. */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'

const KEY = 'voice-playground.folded'

function savedFolds(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean> } catch { return {} }
}

/** Whether a section is folded away, kept for this browser between visits when it can be. */
export function useFolded(name: string): [boolean, () => void] {
  const [folded, setFolded] = useState(() => savedFolds()[name] === true)
  const toggle = () => {
    const next = !folded
    setFolded(next)
    try { localStorage.setItem(KEY, JSON.stringify({ ...savedFolds(), [name]: next })) } catch { /* not kept */ }
  }
  return [folded, toggle]
}

export function PaneBar({ title, children, folded, onToggle }: { title: string; children?: ReactNode; folded?: boolean; onToggle?: () => void }) {
  const Chevron = folded ? ChevronRight : ChevronDown
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle bg-surface-2 px-3 py-1.5">
      <h2 className="flex-1 text-micro font-medium uppercase tracking-wide text-text-muted">
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-expanded={!folded} className="flex items-center gap-1 uppercase tracking-wide hover:text-text-primary max-sm:min-h-10">
            <Chevron size={12} aria-hidden />{title}
          </button>
        ) : title}
      </h2>
      {children}
    </div>
  )
}

export function BarButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`rounded-button px-2 py-0.5 text-micro font-button max-sm:min-h-10 ${BUTTON_SECONDARY}`}
    >
      {children}
    </button>
  )
}
