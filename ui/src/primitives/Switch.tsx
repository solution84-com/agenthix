import { DISABLED, FOCUS_RING } from './controlStyles'
import { Tooltip } from './Tooltip'
import { useRefusal, type Refusal } from './useRefusal'

/**
 * On or off: the accent while on, a hairline outline while off; 40 % and still when disabled; on a phone its hit area grows to 44 px tall (the track stays 20). Its label is its
 * accessible name; a visible label beside it says the same. With a `refusal` (in place of `disabled` when the reason
 * is known) it looks disabled but stays focusable, gives the reason in its tooltip, and a press opens the dialog.
 */
export function Switch({ on, onChange, label, disabled, refusal }: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
  disabled?: boolean
  refusal?: Refusal
}) {
  const refused = useRefusal(refusal)
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      {...refused.props}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-3 transition-colors ${DISABLED} ${FOCUS_RING} ${
        on ? 'bg-accent' : 'bg-surface-3 inset-ring inset-ring-border-strong'
      }`}
    >
      <span aria-hidden className={`inline-block h-4 w-4 rounded-full bg-on-accent shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
  if (!refused.tooltip) return control
  return <><Tooltip label={refused.tooltip} side="top" wrap>{control}</Tooltip>{refused.dialog}</>
}
