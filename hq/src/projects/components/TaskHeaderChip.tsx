import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { MENU_ITEM, MenuHeading, PopSheet } from '@agenthix/ui/primitives'
import { TaskTypeMark } from '@agenthix/ui/tasks'
import type { PlaceChoice } from './taskPlace'

const CHIP = 'flex min-w-0 max-w-[14rem] items-center gap-1 rounded-full border border-border bg-surface-1 py-0.5 pl-2 pr-1.5 text-micro font-medium text-text-primary'

/**
 * One of a task header's chips (D10): its type or its column, by name only. Where the person may change it, the chip
 * opens the one menu with the choices, a check on the current one and a line under any that needs saying; a choice
 * known not to work is greyed with why. On a phone the chip keeps its look and its tap target is 44 px tall.
 */
export function TaskHeaderChip({ label, name, icon, choices, onChoose, testId }: {
  /** What the chip and its menu are: "Type", "Column". */
  label: string
  /** What it shows: the type's or the column's name. */
  name: string
  icon?: string
  choices: PlaceChoice[]
  /** Absent where the person may not change it: the chip is words only. */
  onChoose?: (id: string) => void
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const mark = icon ? <TaskTypeMark type={{ name, icon }} size={12} /> : null
  if (!onChoose) {
    return (
      <span data-testid={testId} title={`${label}: ${name}`} className={`${CHIP} pr-2`}>
        {mark}<span className="min-w-0 truncate">{name}</span>
      </span>
    )
  }
  return (
    <span className="relative flex min-w-0 shrink">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${name}`} onClick={() => setOpen(o => !o)}
        className="group flex min-w-0 items-center rounded-full focus-visible:outline-none max-sm:min-h-11"
      >
        <span
          data-testid={testId}
          className={`${CHIP} group-hover:bg-surface-hover group-aria-expanded:bg-selected group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface-1`}
        >
          {mark}
          <span className="min-w-0 truncate">{name}</span>
          <ChevronDown size={12} aria-hidden className="shrink-0 text-text-muted" />
        </span>
      </button>
      {open && (
        <PopSheet label={label} onClose={() => setOpen(false)} align="left" width={icon ? 'sm:w-72' : 'sm:w-56'}>
          <MenuHeading label={label} />
          {choices.map(c => (
            <button
              key={c.id} type="button" role="menuitemradio" aria-checked={c.current}
              disabled={!!c.disabledWhy} title={c.disabledWhy}
              className={MENU_ITEM}
              onClick={() => { setOpen(false); if (!c.current) onChoose(c.id) }}
            >
              <span className="mt-0.5 flex w-4 shrink-0 justify-center text-accent">{c.current && <Check size={14} aria-hidden />}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {c.icon && <span aria-hidden className="inline-flex"><TaskTypeMark type={{ name: c.label, icon: c.icon }} /></span>}
                  <span className="min-w-0 truncate">{c.label}</span>
                </span>
                {c.hint && <span className={`block text-micro text-text-muted ${c.icon ? 'pl-[22px]' : ''}`}>{c.hint}</span>}
              </span>
            </button>
          ))}
        </PopSheet>
      )}
    </span>
  )
}
