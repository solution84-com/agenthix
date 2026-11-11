import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ModelList, type ChooseMany } from './ModelList'
import type { ListModel } from './modelListLogic'
import { ModelPopover } from './ModelPopover'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'

/**
 * Choosing many models: *＋ Add models* opens the one model list with a tick on each row, a pattern row for what is
 * typed, and *Add N models* at the foot. The place shows what it holds, as chips beside the button.
 */
export function AddModelsButton({ models, offered, added, patternAdded, onAdd, ariaLabel, disabled = false }: {
  models: readonly ListModel[]
  offered: string
  added: ChooseMany['added']
  patternAdded: ChooseMany['patternAdded']
  onAdd: ChooseMany['onAdd']
  /** The button's name where there are two lists side by side: "Add models to Never". */
  ariaLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <ModelPopover open={open} onClose={() => setOpen(false)} trigger={ref => (
      <button ref={ref} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-button px-2.5 py-1 text-micro font-button ${BUTTON_SECONDARY}`}>
        <Plus size={12} aria-hidden />Add models
      </button>
    )}>
      {close => <ModelList mode="many" models={models} offered={offered} added={added} patternAdded={patternAdded} onAdd={onAdd} onClose={close} />}
    </ModelPopover>
  )
}
