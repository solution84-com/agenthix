import { useState } from 'react'
import { CheckGlyph, ChevronRightGlyph, PlusGlyph } from './Glyphs'
import { CONTROL_HEIGHT, FOCUS_RING } from './controlStyles'
import { MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from './Menus'

/** A filter chip and ＋ Filter are one pill, the same height as every control in the row; ＋ Filter is dashed. */
export const FILTER_PILL = `${CONTROL_HEIGHT} inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-1 text-small ${FOCUS_RING}`

/** One filter ＋ Filter offers: its choices in a second step, or `direct`, the one value it sets at once. */
export interface AddFilterKind {
  key: string
  label: string
  choices?: { value: string; label: string }[]
  direct?: string
}

/**
 * ＋ Filter (the one way a list adds a filter that its row does not show): "Filter by" lists the kinds, a kind lists
 * its choices with a check on the chosen one and a way back, and a choice closes the menu. The task lists and the Runs
 * history use it.
 */
export function AddFilterMenu({ kinds, chosen, onChoose }: {
  kinds: AddFilterKind[]
  /** The value a kind has now, for its check. */
  chosen: (key: string) => string | null | undefined
  onChoose: (key: string, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<AddFilterKind | null>(null)
  const close = () => { setOpen(false); setPicking(null) }
  const choose = (key: string, value: string) => { onChoose(key, value); close() }
  return (
    <div className="relative">
      <button
        type="button" className={`${FILTER_PILL} border-dashed px-3 text-text-secondary hover:bg-surface-hover ${OPENS_MENU}`}
        aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}
      >
        <PlusGlyph size={14} />
        Filter
      </button>
      {open && (
        <PopSheet label={picking ? picking.label : 'Filter by'} onClose={close} align="right">
          {picking === null ? (
            <>
              <MenuHeading label="Filter by" />
              {kinds.map(k => (
                <button
                  key={k.key} type="button" role="menuitem" className={MENU_ITEM}
                  onClick={() => (k.direct !== undefined ? choose(k.key, k.direct) : setPicking(k))}
                >
                  <span className="flex-1">{k.label}</span>
                  {k.direct === undefined && <ChevronRightGlyph size={14} className="shrink-0 self-center text-text-muted" />}
                </button>
              ))}
            </>
          ) : (
            <>
              <MenuHeading label={picking.label} onBack={() => setPicking(null)} backLabel="Back to Filter by" />
              {(picking.choices ?? []).length === 0 && <p className="px-3 py-2 text-small text-text-muted">None in this list.</p>}
              {(picking.choices ?? []).map(c => (
                <button key={c.value} type="button" role="menuitem" className={MENU_ITEM} onClick={() => choose(picking.key, c.value)}>
                  <span className="flex w-4 shrink-0 justify-center self-center text-accent">{chosen(picking.key) === c.value && <CheckGlyph size={14} />}</span>
                  <span className="flex-1">{c.label}</span>
                </button>
              ))}
            </>
          )}
        </PopSheet>
      )}
    </div>
  )
}
