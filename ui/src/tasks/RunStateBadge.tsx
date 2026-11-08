import { runStateClasses, runStateLabel, runWaitText, type RunWaitNote } from './runState'

export interface RunStateBadgeProps {
  state: string | null | undefined
  /** Why a queued task has not started; shown as the badge's tooltip. */
  wait?: RunWaitNote | null
  className?: string
}

/** A task's run state as a badge; renders nothing when no run is pending. */
export function RunStateBadge({ state, wait, className = '' }: RunStateBadgeProps) {
  const label = runStateLabel(state)
  if (!label) return null
  return (
    <span
      title={runWaitText(wait) ?? undefined}
      className={`inline-block text-micro font-medium px-2 py-1 rounded-lg ${runStateClasses(state)} ${className}`}
    >
      {label}
    </span>
  )
}
