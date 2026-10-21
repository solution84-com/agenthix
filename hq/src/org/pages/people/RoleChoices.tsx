import { ORG_ROLE_CHOICES, type OrgRole } from './peopleFormat'

/** The organisation's roles side by side, each with one line saying what it allows. */
export function RoleChoices({ value, onChange, label, disabled }: {
  value: OrgRole | null
  onChange: (role: OrgRole) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ORG_ROLE_CHOICES.map(c => {
        const on = value === c.value
        return (
          <button
            key={c.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => !on && onChange(c.value)}
            className={`rounded-lg border px-3 py-2 text-left text-small text-text-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default ${on ? 'border-accent bg-accent-subtle ring-2 ring-accent/20' : 'border-border bg-surface-1 hover:border-accent/50 disabled:hover:border-border'}`}
          >
            <span className="block text-body font-medium text-text-primary">{c.label}</span>
            {c.line}
          </button>
        )
      })}
    </div>
  )
}
