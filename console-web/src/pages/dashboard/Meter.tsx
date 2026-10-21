/** A figure and a bar that only repeats it: the words carry the meaning. */
export function Meter({ label, value, text, warn = false, faded = false }: {
  label: string
  /** 0–100; null draws an empty bar. */
  value: number | null
  text: string
  warn?: boolean
  /** The figure is old (the machine is not answering). */
  faded?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 text-micro ${faded ? 'opacity-60' : ''}`}>
      <span className="w-14 flex-none text-text-muted">{label}</span>
      <span
        role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0} aria-valuetext={text}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-chip"
      >
        <span className={`block h-full rounded-full ${warn ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
      </span>
      <em className="w-20 flex-none text-right font-medium not-italic text-text-secondary">{text}</em>
    </div>
  )
}
