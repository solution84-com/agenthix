import type { ReactNode } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { XGlyph } from './Glyphs'

import { CONTROL_HEIGHT, FOCUS_RING } from './controlStyles'

export { CONTROL_HEIGHT, FOCUS_RING }

/** The one style of a list's search box and filters, wherever a list has them (white, bordered). */
export function SearchField({ label, value, onChange, placeholder, className = '' }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Kept for callers; every search box is now drawn alike (white, bordered, 36 px). */
  prominent?: boolean
}) {
  // A block, so the spacing and width a caller gives it apply: an inline label is only as tall as its text.
  return (
    <label className={`relative block min-w-[10rem] ${className}`}>
      <span className="sr-only">{label}</span>
      <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className={`${CONTROL_HEIGHT} w-full rounded-lg border border-border pl-8 text-small text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none ${value ? 'pr-9' : 'pr-2.5'} bg-surface-1`}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange('')}
          className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary max-sm:h-9 max-sm:w-9 ${FOCUS_RING}`}
        >
          <XGlyph size={13} />
        </button>
      )}
    </label>
  )
}

export function FilterSelect({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="relative inline-block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${CONTROL_HEIGHT} appearance-none rounded-lg border border-border bg-surface-1 pl-2.5 pr-7 text-small text-text-secondary focus:border-accent/50 focus:outline-none`}
      >
        {children}
      </select>
      <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
    </label>
  )
}
