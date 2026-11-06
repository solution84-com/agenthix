import type { ReactNode } from 'react'
import { ChevronDown, Search } from 'lucide-react'

/** The one style of a list's search box and filters, wherever a list has them (white, bordered). */
export function SearchField({ label, value, onChange, placeholder, className = '', prominent = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** A page's main search, in a toolbar of 36 px controls: taller, and filled so it reads as the place to type. */
  prominent?: boolean
}) {
  return (
    <label className={`relative min-w-[10rem] ${className}`}>
      <span className="sr-only">{label}</span>
      <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className={`w-full rounded-lg border pl-8 pr-2.5 text-small text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none ${prominent ? 'h-9 border-border bg-surface-0 focus:bg-surface-1' : 'border-border-subtle bg-surface-1 py-1.5'}`}
      />
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
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border-subtle bg-surface-1 py-1.5 pl-2.5 pr-7 text-small text-text-secondary focus:border-accent/50 focus:outline-none"
      >
        {children}
      </select>
      <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
    </label>
  )
}
