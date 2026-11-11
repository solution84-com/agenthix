import { SCROLL_EDGE_FADE, SEGMENT_CHOSEN, SEGMENT_PIECE, SEGMENT_PLAIN, SEGMENT_STRIP } from './controlStyles'

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
 * history's tabs, a run's tool calls), drawn as a segmented control: the pressed tab is the raised piece. On a phone
 * each is tall enough to tap and the strip scrolls sideways, fading at its edge.
 */
export function FilterTabs<T extends string>({ label, tabs, value, onChange, className = '' }: {
  label: string
  tabs: FilterTab<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`${SEGMENT_STRIP} max-w-full overflow-x-auto ${SCROLL_EDGE_FADE} ${className}`}>
      {tabs.map(t => (
        <button
          key={t.value} type="button" aria-pressed={value === t.value} title={t.title} onClick={() => onChange(t.value)}
          className={`${SEGMENT_PIECE} shrink-0 cursor-pointer ${value === t.value ? SEGMENT_CHOSEN : SEGMENT_PLAIN}`}
        >
          {t.label}
          {t.count !== undefined && <>{' '}<b className="ml-1 font-medium tabular-nums">{t.count}</b></>}
        </button>
      ))}
    </div>
  )
}
