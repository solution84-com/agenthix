export interface SiteFilterOption {
  slug: string | null              // null for the "All sites" tab
  label: string
  online: boolean
}

export interface SiteFilterBarProps {
  options: SiteFilterOption[]
  activeSlug: string | null
  onSelect: (slug: string | null) => void
}

export function SiteFilterBar({ options, activeSlug, onSelect }: SiteFilterBarProps) {
  return (
    <div className="flex gap-2 p-2 bg-surface-1 border border-border-subtle rounded-xl overflow-x-auto">
      {options.map(opt => {
        const active = opt.slug === activeSlug
        return (
          <button
            key={opt.slug ?? '__all__'}
            type="button"
            onClick={() => onSelect(opt.slug)}
            className={`px-4 py-2 rounded-lg text-small font-semibold whitespace-nowrap border transition-colors ${
              active
                ? 'bg-accent/15 text-on-accent border-accent/40'
                : 'bg-transparent text-text-secondary border-transparent hover:bg-surface-hover'
            } ${!opt.online && opt.slug !== null ? 'opacity-50' : ''}`}
            title={opt.online || opt.slug === null ? undefined : 'Offline'}
          >
            {opt.label}
            {opt.slug !== null && !opt.online && <span className="ml-1.5 text-micro text-text-muted">offline</span>}
          </button>
        )
      })}
    </div>
  )
}
