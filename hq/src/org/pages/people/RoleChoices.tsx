import { ORG_ROLE_CHOICES, type OrgRole } from './peopleFormat'
import { CARD_CLICKABLE, CARD_CHOSEN } from '@agenthix/ui/primitives'

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
            className={`rounded-lg border bg-surface-1 px-3 py-2 text-left text-small text-text-secondary ${CARD_CLICKABLE} ${on ? CARD_CHOSEN : ''}`}
          >
            <span className="block text-body font-medium text-text-primary">{c.label}</span>
            {c.line}
          </button>
        )
      })}
    </div>
  )
}
