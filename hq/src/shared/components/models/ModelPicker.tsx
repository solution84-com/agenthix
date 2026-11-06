import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ModelChoices } from '../../conversations/protocol'
import { ModelList, type DefaultRow } from './ModelList'
import { fromChoices } from './modelListLogic'
import { makerInitials, shortModelName } from './modelPickerLogic'
import { ModelPopover } from './ModelPopover'

/** Which models the list offers, and why, unless the place says otherwise. */
export const OFFERED_HERE = 'Only models every list that applies allows'

type Props = {
  /** Makes the chip a quiet button — no border, muted, the maker's mark and the short model name. */
  quiet?: boolean
  /** The choices from `getModelChoices`; absent while they load. */
  choices: ModelChoices | undefined
  /** The chosen model id, or the default row's value. */
  value: string
  onChange: (model: string) => void
  /** The first row, where the place has a default to fall back on. */
  defaultRow?: DefaultRow
  /** What the chip says for a value the choices do not hold. */
  labelOf?: (model: string) => string
  /** What the chip says whatever is chosen, where the place shows the choice itself: *Change*. */
  buttonText?: string
  /** Opens above the chip, for a chip at the bottom of the screen. */
  above?: boolean
  disabled?: boolean
  /** The chip's id, so a form's label points at it. */
  id?: string
  ariaLabel?: string
  offered?: string
  /** Drawn as a form's field (a task's Details, New task): full width, 36 px (44 on a phone), white and bordered. */
  field?: boolean
}

/**
 * Choosing one model: a chip with the current model (quiet beside a message box) that opens the one model list.
 * Each place that chooses one wraps it in its own words and data.
 */
export function ModelPicker({ quiet = false, field = false, choices, value, onChange, defaultRow, labelOf, buttonText, above = false, disabled = false, id, ariaLabel, offered = OFFERED_HERE }: Props) {
  const [open, setOpen] = useState(false)
  const models = useMemo(() => fromChoices(choices?.models ?? []), [choices])

  const known = choices?.models.find(m => m.value === value) ?? choices?.recent.find(m => m.value === value)
  const onDefault = defaultRow !== undefined && value === defaultRow.value
  const chipText = buttonText
    ?? (onDefault ? (defaultRow.model ? `Default · ${defaultRow.model}` : 'Default')
      : known?.label ?? (value ? (labelOf?.(value) ?? value) : 'Choose a model'))

  return (
    <ModelPopover open={open} onClose={() => setOpen(false)} above={above} block={field} trigger={ref => (
      <button
        ref={ref}
        id={id}
        type="button"
        disabled={disabled || !choices}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={field
          ? 'flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface-1 px-2.5 text-left text-small text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 max-sm:h-11'
          : quiet
          ? 'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-small text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-60 max-lg:min-h-10'
          : 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-chip px-2.5 py-1 text-small text-text-primary hover:bg-surface-hover disabled:opacity-60 max-lg:min-h-10'}
      >
        {quiet && known && !buttonText ? (
          <>
            <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded bg-chip text-[9px] font-semibold text-text-secondary">
              {makerInitials(known.maker)}
            </span>
            <span className="truncate">{shortModelName(known.label, known.maker)}</span>
          </>
        ) : (
          <span className="truncate">{chipText}</span>
        )}
        <ChevronDown size={field ? 14 : 12} aria-hidden className={`shrink-0 text-text-muted ${field ? 'ml-auto' : ''}`} />
      </button>
    )}>
      {close => (
        <ModelList mode="one" models={models} value={value} defaultRow={defaultRow} offered={offered}
          onChoose={onChange} onClose={close} />
      )}
    </ModelPopover>
  )
}
