import type { ReactNode } from 'react'

export type Choice<T extends string> = { value: T; label: string; help: ReactNode; recommended?: boolean }

/** One setting's choices as radio buttons, each with what it means; the chosen one has the strong outline. */
export function ChoiceGroup<T extends string>({ name, label, value, choices, disabled, onChange }: {
  name: string
  label: string
  value: T
  choices: readonly Choice<T>[]
  disabled?: boolean
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="mt-2 space-y-2" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {choices.map(c => (
        <label key={c.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${c.value === value ? 'border-border-strong bg-selected' : 'border-border-subtle hover:bg-surface-hover'}`}>
          <input type="radio" name={name} value={c.value} checked={c.value === value} onChange={() => onChange(c.value)} className="mt-1" />
          <span className="min-w-0">
            <span className="text-body font-medium text-text-primary">{c.label}</span>
            {c.recommended && <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-micro text-text-secondary">recommended</span>}
            <span className="block text-small text-text-secondary">{c.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** A heading for one setting, with the code of the board's decision it came from left out: people read the words. */
export function SettingBlock({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-8">
      <h2 className="text-h3 font-semibold text-text-primary">{title}</h2>
      {intro && <p className="mt-0.5 text-small text-text-secondary">{intro}</p>}
      {children}
    </section>
  )
}
