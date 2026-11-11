import { useState } from 'react'
import { Check, Columns3 } from 'lucide-react'
import { CONTROL_HEIGHT } from '../primitives/controlStyles'
import { ChevronDownGlyph } from '../primitives/Glyphs'
import { MENU_ITEM, MenuHeading, PLAIN_TRIGGER, PopSheet } from '../primitives/Menus'
import { fieldColumn, toggleColumn } from './taskListColumns'
import type { TaskListColumn, TaskListFieldOption } from './taskListTypes'

const SHOWN: { column: TaskListColumn; label: string }[] = [
  { column: 'column', label: 'Column' },
  { column: 'agent', label: 'Agent' },
  { column: 'due', label: 'Due' },
  { column: 'sprint', label: 'Sprint' },
  { column: 'priority', label: 'Priority' },
]

function Item({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} className={MENU_ITEM} onClick={onToggle}>
      <span className="mt-0.5 flex w-4 shrink-0 justify-center text-text-primary">{on && <Check size={14} aria-hidden />}</span>
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-micro text-text-muted">{hint}</span>}
      </span>
    </button>
  )
}

/**
 * Fields ▾ (T2, D4): which columns a list's lines show. Column, Agent and Due by default; Sprint, Priority and each
 * single-select custom field can be added. The menu stays open while columns are ticked.
 */
export function TasksFieldsMenu({ columns, fields, onColumns }: {
  columns: readonly TaskListColumn[]
  fields: TaskListFieldOption[]
  onColumns: (next: TaskListColumn[]) => void
}) {
  const [open, setOpen] = useState(false)
  const toggle = (c: TaskListColumn) => onColumns(toggleColumn(columns, c))
  return (
    <div className="relative">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`${CONTROL_HEIGHT} shrink-0 ${PLAIN_TRIGGER}`}
      >
        <Columns3 size={14} aria-hidden className="text-text-muted" />
        Fields
        <ChevronDownGlyph size={14} className="text-text-muted" />
      </button>
      {open && (
        <PopSheet label="Fields" onClose={() => setOpen(false)}>
          <MenuHeading label="Show on the list" />
          {SHOWN.map(s => <Item key={s.column} label={s.label} on={columns.includes(s.column)} onToggle={() => toggle(s.column)} />)}
          {fields.length > 0 && (
            <>
              <div className="mt-1"><MenuHeading label="Custom fields" /></div>
              {fields.map(f => (
                <Item key={f.id} label={f.name} hint="single select" on={columns.includes(fieldColumn(f.id))} onToggle={() => toggle(fieldColumn(f.id))} />
              ))}
            </>
          )}
        </PopSheet>
      )}
    </div>
  )
}
