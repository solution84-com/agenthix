/** The Scenarios row's "Add a model" button: the shared model list with a tick on each row, as `AddModelsButton` draws it. */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ModelList, type ChooseMany } from '../../../shared/components/models/ModelList'
import type { ListModel } from '../../../shared/components/models/modelListLogic'
import { ModelPopover } from '../../../shared/components/models/ModelPopover'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'

export function AddAModel({ models, offered, added, onAdd, disabled, title }: {
  models: readonly ListModel[]
  offered: string
  added: ChooseMany['added']
  onAdd: ChooseMany['onAdd']
  disabled: boolean
  /** Why it is inactive, when it is. */
  title?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <ModelPopover open={open} onClose={() => setOpen(false)} trigger={ref => (
      <button
        ref={ref} type="button" aria-label="Add a model to compare" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} title={title}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-button px-2.5 py-1 text-micro font-button max-lg:min-h-10 ${BUTTON_SECONDARY}`}
      >
        <Plus size={12} aria-hidden />Add a model
      </button>
    )}>
      {close => <ModelList mode="many" models={models} offered={offered} added={added} patternAdded={() => false} onAdd={onAdd} onClose={close} />}
    </ModelPopover>
  )
}
