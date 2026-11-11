import { NativeSelect } from './NativeSelect'

export interface SiteOption {
  siteId: string
  name: string
  status: string  // 'PENDING' | 'ONLINE' | 'OFFLINE' | 'REVOKED' | 'UNLINKED'
}

export interface SiteSelectorProps {
  sites: SiteOption[]
  value: string                                  // siteId
  onChange: (siteId: string) => void
  label?: string
  required?: boolean
  helperText?: string
}

function StatusDot({ status }: { status: string }) {
  // TODO: promote these to design tokens once status colors land in tokens.css
  const color = status === 'ONLINE' ? 'var(--color-success)'
              : status === 'PENDING' ? 'var(--color-warning)'
              : status === 'OFFLINE' ? 'var(--color-warning)'
              : 'var(--color-text-muted)'
  return (
    <span
      aria-hidden
      className="inline-block w-1.5 h-1.5 rounded-full"
      style={{
        background: color,
        boxShadow: status === 'ONLINE' ? `0 0 6px ${color}` : 'none',
      }}
    />
  )
}

export function SiteSelector({
  sites, value, onChange, label = 'Site', required, helperText,
}: SiteSelectorProps) {
  if (sites.length === 0) {
    return (
      <div className="space-y-1">
        <span className="block text-small text-text-secondary">{label}</span>
        <p className="text-small text-text-muted italic">No connected sites</p>
      </div>
    )
  }

  if (sites.length === 1) {
    const site = sites[0]
    return (
      <div className="space-y-1">
        <span className="block text-small text-text-secondary">{label}</span>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-chip">
          <StatusDot status={site.status} />
          <span className="text-body text-text-primary">{site.name}</span>
        </div>
        {helperText && <p className="text-small text-text-muted">{helperText}</p>}
      </div>
    )
  }

  const hasMatchingValue = sites.some(s => s.siteId === value)

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="block text-small text-text-secondary">
          {label}{required && <span className="text-danger/70 ml-1" aria-label="required">*</span>}
        </span>
        <NativeSelect
          value={hasMatchingValue ? value : ''}
          onChange={e => onChange(e.target.value)}
          required={required}
        >
          {!hasMatchingValue && (
            <option value="" disabled>Select a site</option>
          )}
          {sites.map(s => (
            <option key={s.siteId} value={s.siteId}>{s.name}</option>
          ))}
        </NativeSelect>
      </label>
      {helperText && <p className="text-small text-text-muted">{helperText}</p>}
    </div>
  )
}
