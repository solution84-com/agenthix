import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { ROW_CHOSEN } from '@agenthix/ui/primitives'
import { PRICE_HINT, costWords, type ListModel } from './modelListLogic'
import { makerInitials } from './modelPickerLogic'

/** The price marks, `$` to `$$$`, with what they mean in their tooltip and the cost in words for a screen reader. */
export function PriceMarks({ price }: { price: 1 | 2 | 3 }) {
  return (
    <span title={PRICE_HINT} aria-label={costWords(price)} className="shrink-0 text-small tabular-nums text-text-muted">
      {'$'.repeat(price)}
    </span>
  )
}

/** A maker's heading: its mark and its name. */
export function MakerHeading({ maker }: { maker: string }) {
  return (
    <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-micro font-medium uppercase tracking-wide text-text-muted">
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded bg-chip text-micro font-medium normal-case text-text-secondary">
        {makerInitials(maker)}
      </span>
      {maker}
    </p>
  )
}

/** One row of the list: a tick, what it is with one line under it, and what sits at its end. */
export function ListRow({ id, ticked, pickable, dim = false, highlighted, onHover, onPick, title, under, end }: {
  id: string
  /** Greyed out: a provider that is not working. */
  dim?: boolean
  ticked: boolean
  pickable: boolean
  highlighted: boolean
  onHover: () => void
  onPick: () => void
  title: ReactNode
  under?: ReactNode
  end?: ReactNode
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={ticked}
      aria-disabled={!pickable || undefined}
      onMouseEnter={onHover}
      onClick={() => { if (pickable) onPick() }}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-small max-lg:min-h-10 ${pickable ? 'cursor-pointer' : 'cursor-not-allowed'} ${dim ? 'opacity-40' : ''} ${ticked ? ROW_CHOSEN : highlighted && pickable ? 'bg-surface-hover text-text-primary' : 'text-text-secondary'}`}
    >
      <span className="w-4 shrink-0 text-text-primary">{ticked && <Check size={14} aria-hidden />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {under && <span className="block truncate text-micro text-text-muted">{under}</span>}
      </span>
      {end}
    </li>
  )
}

/** What a model's row says under its name: the route where it is needed, and a provider that is not working. */
export function modelUnder(m: ListModel): string | undefined {
  const parts = [m.route, m.notWorking ? 'not working' : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}
