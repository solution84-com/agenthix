import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { ShowAlsoChoices, type ShowAlsoPicker } from './ShowAlso'

export interface ColumnMenuItem {
  label: string
  onSelect: () => void
}

/**
 * A column's "⋯": the same button on every column. The Backlog's adds "Show also…", which turns the menu into
 * the list of other boards' backlogs to show beside it.
 */
export function ColumnMenu({ label, items, showAlso }: { label: string; items: ColumnMenuItem[]; showAlso?: ShowAlsoPicker }) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const offersShowAlso = !!showAlso && showAlso.options.length > 0
  if (items.length === 0 && !offersShowAlso) return null
  const close = () => { setOpen(false); setPicking(false) }
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={close} />}
      <button
        type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-lg border border-border bg-surface-1 p-1.5 text-text-secondary hover:bg-surface-hover"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface-1 font-normal shadow-lg">
          {picking && showAlso ? <ShowAlsoChoices {...showAlso} /> : (
            <>
              {offersShowAlso && (
                <button type="button" role="menuitem" onClick={() => setPicking(true)} className="block w-full px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover">
                  Show also…{showAlso.chosen.length > 0 ? ` (${showAlso.chosen.length})` : ''}
                </button>
              )}
              {items.map(item => (
                <button
                  key={item.label} type="button" role="menuitem"
                  onClick={() => { close(); item.onSelect() }}
                  className="block w-full px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover"
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
