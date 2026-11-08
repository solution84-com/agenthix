import { FOCUS_RING, SCROLL_EDGE_FADE } from './controlStyles'

export type FilterTab<T extends string> = {
  value: T
  label: string
  /** Its count, after the label ("Running 3"); left out, none. */
  count?: number
  /** A tooltip saying what the count holds. */
  title?: string
}

/**
 * The one row of tabs that narrow a list to one state, each with its count (the Runs panel's filters, the Runs
 * history's tabs, a run's tool calls): pressed, a tab shows the accent's light fill; on a phone each is tall enough to
 * tap and the row scrolls sideways, fading at its edge.
 */
export function FilterTabs<T extends string>({ label, tabs, value, onChange, className = '' }: {
  label: string
  tabs: FilterTab<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`flex gap-1 overflow-x-auto ${SCROLL_EDGE_FADE} ${className}`}>
      {tabs.map(t => (
        <button
          key={t.value} type="button" aria-pressed={value === t.value} title={t.title} onClick={() => onChange(t.value)}
          className={`inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-medium transition-colors max-sm:min-h-11 max-sm:px-3 ${FOCUS_RING} ${
            value === t.value ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          {t.label}
          {t.count !== undefined && <>{' '}<b className="ml-1 font-semibold tabular-nums">{t.count}</b></>}
        </button>
      ))}
    </div>
  )
}
