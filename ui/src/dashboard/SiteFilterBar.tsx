import { SegmentedControl } from '../primitives/SegmentedControl'

const ALL = '__all__'

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
    <div className="overflow-x-auto">
      <SegmentedControl
        label="Site" value={activeSlug ?? ALL} onChange={v => onSelect(v === ALL ? null : v)}
        options={options.map(opt => ({
          value: opt.slug ?? ALL,
          label: <>{opt.label}{opt.slug !== null && !opt.online && <span className="text-micro text-text-muted">offline</span>}</>,
          title: opt.online || opt.slug === null ? undefined : 'Offline',
        }))}
      />
    </div>
  )
}
