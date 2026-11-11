import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { XGlyph } from './Glyphs'
import { PlainSelect } from './PlainSelect'

import { CONTROL_HEIGHT, FIELD, FOCUS_RING } from './controlStyles'

export { CONTROL_HEIGHT, FOCUS_RING }

/** The one style of a list's search box, wherever a list has one: a field (`FIELD`). Its filters are `FilterSelect`. */
export function SearchField({ label, value, onChange, placeholder, className = '' }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Kept for callers; every search box is now drawn alike (a field, 36 px). */
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
        className={`${CONTROL_HEIGHT} w-full rounded-lg ${FIELD} pl-8 text-small [&::-webkit-search-cancel-button]:appearance-none ${value ? 'pr-9' : 'pr-2.5'}`}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange('')}
          className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed max-sm:h-9 max-sm:w-9 ${FOCUS_RING}`}
        >
          <XGlyph size={13} />
        </button>
      )}
    </label>
  )
}

/** A list's filter: a plain-text picker (`PlainSelect`) the height of the row, never a boxed field. */
export function FilterSelect({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <PlainSelect toolbar aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      {children}
    </PlainSelect>
  )
}
