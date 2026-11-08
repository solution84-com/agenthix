import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button, MENU_ITEM, MenuHeading, Modal, PopSheet, Tooltip } from '@agenthix/ui/primitives'
import { ICON_BUTTON } from './routineStyles'

export type RoutineMenuItem = { label: string; onSelect: () => void; disabledWhy?: string; danger?: boolean }

/** A routine's ⋯: the items given, each greyed with why when it is known not to work. */
export function RoutineMenu({ title, items }: { title: string; items: RoutineMenuItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <Tooltip label="More" disabled={open}>
        <button type="button" aria-label={`More for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={ICON_BUTTON}>
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </Tooltip>
      {open && (
        <PopSheet label={`Actions for ${title}`} onClose={() => setOpen(false)} width="sm:w-56">
          <div className="sm:hidden"><MenuHeading label={title} /></div>
          {items.map(i => (
            <button
              key={i.label} type="button" role="menuitem" disabled={!!i.disabledWhy} title={i.disabledWhy}
              className={`${MENU_ITEM} ${i.danger ? 'text-danger' : ''}`}
              onClick={() => { setOpen(false); i.onSelect() }}
            >
              {i.label}
            </button>
          ))}
        </PopSheet>
      )}
    </span>
  )
}

/** Delete… asks first: the routine stops for good; the runs it made stay in Runs. Its one filled button deletes. */
export function DeleteRoutineDialog({ title, onCancel, onDelete }: { title: string; onCancel: () => void; onDelete: () => void }) {
  return (
    <Modal open onClose={onCancel} title={`Delete ${title}?`}>
      <p className="text-body text-text-secondary">It will not run again, and its list of runs here goes with it. The runs it made stay in Runs.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="danger" onClick={onDelete}>Delete routine</Button>
      </div>
    </Modal>
  )
}
