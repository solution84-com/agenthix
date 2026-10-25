/** The On/Off switch. Read-only for those who may not turn a workflow on or off: they see the state in words. */
export function WorkflowSwitch({ on, label, onToggle, busy }: { on: boolean; label: string; onToggle?: () => void; busy?: boolean }) {
  if (!onToggle) {
    return <span className="text-small text-text-secondary" data-testid="workflow-state">{on ? 'On' : 'Off'}</span>
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 max-lg:h-6 max-lg:w-11 ${on ? 'bg-accent' : 'bg-surface-3'}`}
    >
      <span className={`inline-block size-4 rounded-full bg-surface-0 shadow transition-transform max-lg:size-5 ${on ? 'translate-x-[18px] max-lg:translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}
