import type { ReactNode } from 'react'
import type { ModelChoices } from '@agenthix/core'
import { ModelPicker } from '../../conversations/components/ModelPicker'
import type { ChoiceView } from '../types'

/** The value a picker holds for a choice: the provider's id and the model. */
export const valueOf = (c: ChoiceView | null) => (c ? `${c.providerId}/${c.model}` : '')

/**
 * One model setting: its name, what it is for, and the one picker used everywhere a model is chosen (search box,
 * *model · via provider*, a provider that is not working greyed out). With `followLabel` the setting may follow the
 * layer above, and says so in its first row.
 */
export function ModelChoiceRow({ label, hint, choices, current, followLabel, onChange, disabled }: {
  label: string
  hint: ReactNode
  choices: ModelChoices | undefined
  current: ChoiceView | null
  followLabel?: string
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  return (
    <div className="py-3">
      <div className="text-small font-medium text-text-primary">{label}</div>
      <div className="mt-1.5">
        <ModelPicker
          choices={choices}
          value={valueOf(current)}
          emptyLabel={followLabel}
          labelOf={() => current?.text ?? ''}
          onChange={v => onChange(v === '' ? null : v)}
          ariaLabel={label}
          disabled={disabled}
        />
        {current && <span className="ml-2 text-small text-text-muted">{current.text}{current.notWorking ? ' · not working' : ''}</span>}
      </div>
      <p className="mt-1 text-small text-text-muted">{hint}</p>
    </div>
  )
}
