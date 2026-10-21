/**
 * *Notify the fleet admins if this machine stops answering* (the owner's decision): asked when a machine joins — a
 * site added, moved to a new machine with a code, or restored — and changed on the machine's page. HQ's machine is
 * not asked: it shows ticked and disabled, with why.
 */
export const NOTIFY_LABEL = 'Notify the fleet admins if this machine stops answering'

export function NotifyChoice({ checked, onChange, disabled = false, hint }: {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  /** One line under it: what ticking it does, or why it cannot be changed. */
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-start gap-2 text-small text-text-primary">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange?.(e.target.checked)} className="mt-0.5" />
        <span>{NOTIFY_LABEL}</span>
      </label>
      {hint && <p className="pl-6 text-micro text-text-muted">{hint}</p>}
    </div>
  )
}

/** Under the box where it is asked. */
export const NOTIFY_HINT = 'Silent for 10 minutes, it shows as needing attention and HQ tells every fleet admin until it answers again. Nothing is done to the machine. Leave it unticked for a machine that is often switched off.'

/** Under HQ's box, which cannot be changed. */
export const NOTIFY_HQ_HINT = "Always, for HQ's machine: when it stops answering, HQ is down."
