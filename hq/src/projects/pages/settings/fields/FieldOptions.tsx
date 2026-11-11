import { useState } from 'react'
import { useAction, addFieldOption, removeFieldOption, reorderFieldOptions, updateFieldOption } from 'wasp/client/operations'
import { GripVertical, Plus } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import type { BoardColour, CustomFieldView, FieldOptionFields } from '@agenthix/core'
import { MoreMenu, type MenuItem } from '../../../../org/components/menus'
import { COLUMN_COLOUR_WORDS, COLUMN_SWATCH } from '../../../components/TypeStateColumns'
import { NameDialog, RemoveOptionDialog } from './FieldDialogs'
import { BOARD_COLOURS, FIELD_OPTION_NAME_MAX_LENGTH, VIEWER_CANNOT_CHANGE_FIELDS, droppedBefore, movedOne, newOptionWhy } from './fieldRules'

type Dialog = { kind: 'add' } | { kind: 'rename'; option: FieldOptionFields } | { kind: 'remove'; option: FieldOptionFields } | null

const DRAG_TYPE = 'application/x-field-option'

/** An option's colour as a swatch: the same tokens a type's columns use. */
export function OptionSwatch({ colour }: { colour: BoardColour }) {
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-sm ${COLUMN_SWATCH[colour]}`} />
}

/**
 * A field's options (spec D4), in their order, each with its colour: drag ⠿ to order them (or Move up and Move down in
 * the option's ⋯), rename, recolour, remove, and Add option. Each change is made as it happens.
 */
export function FieldOptions({ field, mayChange, run }: {
  field: CustomFieldView
  mayChange: boolean
  /** Runs a change; a failure opens the centred dialog with Try again. */
  run: (title: string, work: () => Promise<unknown>) => void
}) {
  const add = useAction(addFieldOption)
  const update = useAction(updateFieldOption)
  const reorder = useAction(reorderFieldOptions)
  const remove = useAction(removeFieldOption)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const ids = field.options.map(o => o.id)
  const why = mayChange ? (field.archivedAt ? 'It is archived: bring it back first' : undefined) : VIEWER_CANNOT_CHANGE_FIELDS
  const addWhy = newOptionWhy(field, mayChange)
  const order = (next: string[] | null) => { if (next) run('The options were not reordered', () => reorder({ fieldId: field.id, optionIds: next })) }
  const others = (o?: FieldOptionFields) => field.options.filter(x => x.id !== o?.id).map(x => x.name)

  const menuOf = (o: FieldOptionFields): MenuItem[] => [
    { label: 'Rename…', disabled: !!why, title: why, onSelect: () => setDialog({ kind: 'rename', option: o }) },
    { label: 'Move up', disabled: !!why || !movedOne(ids, o.id, -1), title: why, onSelect: () => order(movedOne(ids, o.id, -1)) },
    { label: 'Move down', disabled: !!why || !movedOne(ids, o.id, 1), title: why, onSelect: () => order(movedOne(ids, o.id, 1)) },
    ...BOARD_COLOURS.filter(c => c !== o.colour).map((colour, i) => ({
      label: `Colour: ${COLUMN_COLOUR_WORDS[colour]}`, disabled: !!why, title: why, separatorBefore: i === 0,
      onSelect: () => run(`${o.name}'s colour was not changed`, () => update({ optionId: o.id, colour })),
    })),
    { label: 'Remove…', danger: true, separatorBefore: true, disabled: !!why, title: why, onSelect: () => setDialog({ kind: 'remove', option: o }) },
  ]

  return (
    <div className="space-y-2">
      {field.options.length === 0 ? (
        <p className="text-small text-text-muted">No options yet: a task can't be given a value until the field has one.</p>
      ) : (
        <ul aria-label={`${field.name}'s options`} className="space-y-2">
          {field.options.map(o => (
            <li
              key={o.id} data-testid={`option-${o.name}`}
              draggable={!why} onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, o.id); setDragging(o.id) }} onDragEnd={() => setDragging(null)}
              onDragOver={e => { if (dragging && dragging !== o.id) e.preventDefault() }}
              onDrop={e => { e.preventDefault(); const d = e.dataTransfer.getData(DRAG_TYPE) || dragging; setDragging(null); if (d) order(droppedBefore(ids, d, o.id)) }}
              className={`flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card pl-1.5 max-lg:min-h-11 max-lg:pl-3 ${dragging === o.id ? 'opacity-50' : ''}`}
            >
              {!why && <span className="inline-flex shrink-0 cursor-grab text-text-muted max-lg:hidden" title="Drag to order"><GripVertical size={14} aria-hidden /></span>}
              <OptionSwatch colour={o.colour} />
              <span className="min-w-0 flex-1 truncate text-small font-medium text-text-primary">{o.name}</span>
              <span className="shrink-0 text-micro text-text-muted max-sm:hidden">{COLUMN_COLOUR_WORDS[o.colour]}</span>
              <MoreMenu items={menuOf(o)} label={`${o.name}: more`} />
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary" leadingIcon={<Plus size={14} aria-hidden />} disabled={!!addWhy} title={addWhy ?? undefined}
        onDragOver={e => { if (dragging) e.preventDefault() }}
        onDrop={e => { e.preventDefault(); const d = e.dataTransfer.getData(DRAG_TYPE) || dragging; setDragging(null); if (d) order(droppedBefore(ids, d, null)) }}
        onClick={() => setDialog({ kind: 'add' })}
      >
        Add option
      </Button>
      {dialog?.kind === 'add' && (
        <NameDialog title={`A new option in ${field.name}`} initial="" confirm="Add option" max={FIELD_OPTION_NAME_MAX_LENGTH} taken={others()} what="option"
          onCancel={() => setDialog(null)} onConfirm={name => { setDialog(null); run('The option was not added', () => add({ fieldId: field.id, name })) }} />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog title={`Rename ${dialog.option.name}`} initial={dialog.option.name} confirm="Rename" max={FIELD_OPTION_NAME_MAX_LENGTH} taken={others(dialog.option)} what="option"
          onCancel={() => setDialog(null)} onConfirm={name => { setDialog(null); run(`${dialog.option.name} was not renamed`, () => update({ optionId: dialog.option.id, name })) }} />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveOptionDialog option={dialog.option.name} field={field.name} onCancel={() => setDialog(null)}
          onRemove={() => { setDialog(null); run(`${dialog.option.name} was not removed`, () => remove({ optionId: dialog.option.id })) }} />
      )}
    </div>
  )
}
