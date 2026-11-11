import type { ReactNode } from 'react'
import { CARD_CHOSEN, CARD_CLICKABLE, SCROLL_EDGE_FADE } from './controlStyles'

export type ScorecardItem = {
  key: string
  label: ReactNode
  /** The number, already in words ("5", "$0.44", "…", "–"). */
  count: ReactNode
  detail?: ReactNode
  /** A card that is also a quick filter; without it the card only counts. */
  onChoose?: () => void
  chosen?: boolean
  disabled?: boolean
}

const CARD = 'flex min-w-[7.5rem] shrink-0 flex-col justify-start rounded-xl border px-3 py-2 text-left sm:min-w-0'

/**
 * A row of counts at the top of a list or a live view (Tasks, Your tasks, a Workroom, Workrooms): a label, the number
 * and a line under it. A card that filters is a clickable card (`CARD_CLICKABLE`), and the chosen one takes the ink
 * edge (`CARD_CHOSEN`). From `sm` up the cards share the row and shrink to fit it; on a phone the row
 * scrolls sideways, fading at its edge.
 */
export function Scorecards({ label, items, className = 'px-4 pt-4' }: { label: string; items: ScorecardItem[]; className?: string }) {
  return (
    <div
      role="group" aria-label={label}
      className={`flex gap-2 overflow-x-auto sm:grid sm:grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] sm:overflow-visible ${SCROLL_EDGE_FADE} ${className}`}
    >
      {items.map((c) => {
        const body = (
          <>
            <span className="block truncate text-micro font-medium text-text-secondary">{c.label}</span>
            <span className="block text-h2 font-medium leading-tight text-text-primary tabular-nums">{c.count}</span>
            <span className="block truncate text-micro text-text-muted">{c.detail ?? ' '}</span>
          </>
        )
        if (!c.onChoose) return <div key={c.key} className={`${CARD} border-border bg-card`}>{body}</div>
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={!!c.chosen}
            onClick={c.onChoose}
            disabled={c.disabled}
            className={`${CARD} bg-card ${CARD_CLICKABLE} ${c.chosen ? CARD_CHOSEN : ''}`}
          >
            {body}
          </button>
        )
      })}
    </div>
  )
}
