import { AutomationSwitch } from '@agenthix/ui/projects'

/** A routine's on/off, with its state in words beside it; greyed with why for someone who may not change it. */
export function RoutineSwitch({ title, on, why, busy, onChange }: {
  title: string
  on: boolean
  why?: string
  busy?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <span title={why} className="inline-flex h-9 shrink-0 items-center gap-2 px-1 text-small text-text-secondary max-sm:h-11">
      <AutomationSwitch label={`${title}: ${on ? 'on' : 'off'}`} on={on} disabled={!!why || busy} onChange={onChange} />
      <span aria-hidden>{on ? 'On' : 'Off'}</span>
    </span>
  )
}
