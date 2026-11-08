import { useState, type DragEvent } from 'react'
import {
  useAction, addTypeColumn, moveTypeColumnToState, removeTypeColumn, reorderTypeColumns, setDefaultTypeColumn, updateTypeColumn,
} from 'wasp/client/operations'
import { GripVertical, Lock, Plus, X } from 'lucide-react'
import { Button, FOCUS_RING, Tooltip } from '@agenthix/ui/primitives'
import { BOARD_COLOURS, TASK_STATES, TASK_STATE_LABELS, type BoardColour, type TaskState, type TaskTypeView, type TypeColumnFields } from '@agenthix/core'
import { MoreMenu, type MenuItem } from '../../../../org/components/menus'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { refusalText } from '../../../../shared/refusal'
import { COLUMN_COLOUR_WORDS, COLUMN_SWATCH } from '../../../components/TypeStateColumns'
import { ColumnNameDialog, MoveColumnDialog, RemoveColumnDialog } from './ColumnDialogs'
import { VIEWER_CANNOT_CHANGE_TYPES, columnRemoveWhy, droppedBefore, movedWithinState } from './typeRules'

type Dialog =
  | { kind: 'add'; state: TaskState }
  | { kind: 'rename'; column: TypeColumnFields }
  | { kind: 'move'; column: TypeColumnFields }
  | { kind: 'remove'; column: TypeColumnFields }

const ICON_BUTTON = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`
const DRAG_TYPE = 'application/x-type-column'

/**
 * A type's columns inside the four task states (spec D10): the states are fixed lanes, Backlog to Done; each column sits
 * in one, ordered within it by dragging ⠿ (or Move up and Move down in its ⋯), one of them the state's default. Each
 * change is made as it happens; one that moves tasks says so in a dialog first.
 */
export function ColumnLanes({ type, held, projectKey, mayChange, onChanged }: {
  type: TaskTypeView
  /** By column id: the tasks it holds. */
  held: Record<string, number>
  projectKey: string
  mayChange: boolean
  onChanged: () => void
}) {
  const add = useAction(addTypeColumn)
  const update = useAction(updateTypeColumn)
  const reorder = useAction(reorderTypeColumns)
  const makeDefault = useAction(setDefaultTypeColumn)
  const move = useAction(moveTypeColumnToState)
  const remove = useAction(removeTypeColumn)
  const attention = useAttention()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const columns = type.columns

  const run = (title: string, work: () => Promise<unknown>) => {
    setDialog(null)
    work().then(onChanged, err => attention.show({ title, text: refusalText(err), retry: () => run(title, work) }))
  }
  const order = (ids: string[] | null) => { if (ids) run('The columns were not reordered', () => reorder({ typeId: type.id, columnIds: ids })) }
  const drop = (state: TaskState, target: string | null) => (e: DragEvent) => {
    e.preventDefault()
    const dragged = e.dataTransfer.getData(DRAG_TYPE) || dragging
    setDragging(null)
    if (dragged) order(droppedBefore(columns, dragged, target, state))
  }

  const menuOf = (c: TypeColumnFields): MenuItem[] => {
    const why = mayChange ? undefined : VIEWER_CANNOT_CHANGE_TYPES
    const up = movedWithinState(columns, c.id, -1)
    const down = movedWithinState(columns, c.id, 1)
    return [
      { label: 'Rename', disabled: !mayChange, title: why, onSelect: () => setDialog({ kind: 'rename', column: c }) },
      ...(c.defaultForState ? [] : [{ label: `Make default for ${TASK_STATE_LABELS[c.state]}`, disabled: !mayChange, title: why, onSelect: () => run(`${c.name} is not the default`, () => makeDefault({ columnId: c.id })) }]),
      { label: 'Move up', disabled: !mayChange || !up, title: why, onSelect: () => order(up) },
      { label: 'Move down', disabled: !mayChange || !down, title: why, onSelect: () => order(down) },
      { label: 'Move to another state…', disabled: !mayChange, title: why, onSelect: () => setDialog({ kind: 'move', column: c }) },
      ...BOARD_COLOURS.filter(colour => colour !== c.colour).map((colour: BoardColour, i) => ({
        label: `Colour: ${COLUMN_COLOUR_WORDS[colour]}`, disabled: !mayChange, title: why, separatorBefore: i === 0,
        onSelect: () => run(`${c.name}'s colour was not changed`, () => update({ columnId: c.id, colour })),
      })),
    ]
  }

  return (
    <>
      <div className="grid grid-cols-4 items-start gap-3 max-lg:grid-cols-1">
        {TASK_STATES.map(state => (
          <section
            key={state} aria-label={TASK_STATE_LABELS[state]} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-2"
            onDragOver={e => { if (dragging && columns.find(c => c.id === dragging)?.state === state) e.preventDefault() }}
            onDrop={drop(state, null)}
          >
            <div className="flex min-h-7 items-center gap-2 px-1 text-small font-medium text-text-secondary">
              <span>{TASK_STATE_LABELS[state]}</span>
              <span className="inline-flex items-center gap-1 text-micro font-normal text-text-muted" title="The task states are built in">
                <Lock size={11} aria-hidden />task state
              </span>
            </div>
            {columns.filter(c => c.state === state).map(c => {
              const removeWhy = mayChange ? columnRemoveWhy(c, columns, held[c.id] ?? 0) : VIEWER_CANNOT_CHANGE_TYPES
              return (
                <div
                  key={c.id} data-testid={`column-${c.name}`}
                  draggable={mayChange} onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, c.id); setDragging(c.id) }} onDragEnd={() => setDragging(null)}
                  onDragOver={e => { if (dragging && dragging !== c.id && columns.find(x => x.id === dragging)?.state === state) e.preventDefault() }}
                  onDrop={e => { e.stopPropagation(); drop(state, c.id)(e) }}
                  className={`flex min-h-10 items-center gap-2 rounded-xl border border-border-subtle bg-surface-1 pl-1.5 max-lg:min-h-11 max-lg:pl-3 ${dragging === c.id ? 'opacity-50' : ''}`}
                >
                  {mayChange && <span className="inline-flex shrink-0 cursor-grab text-text-muted max-lg:hidden" title="Drag to order"><GripVertical size={14} aria-hidden /></span>}
                  {c.colour !== 'neutral' && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-sm ${COLUMN_SWATCH[c.colour]}`} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold text-text-primary">{c.name}</span>
                    {c.defaultForState && <span className="block text-micro text-text-muted">Default</span>}
                  </span>
                  <span className="flex shrink-0 items-center">
                    <MoreMenu items={menuOf(c)} label={`${c.name}: more`} />
                    {/* The greyed ✕ still says why on hover: the tooltip is on its wrapper, which a disabled button can't be. */}
                    <Tooltip label={removeWhy ?? `Remove ${c.name}`} side="top">
                      <span className="inline-flex">
                        <button type="button" aria-label={removeWhy ? `Remove ${c.name}: ${removeWhy}` : `Remove ${c.name}`} disabled={!!removeWhy} className={ICON_BUTTON} onClick={() => setDialog({ kind: 'remove', column: c })}>
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    </Tooltip>
                  </span>
                </div>
              )
            })}
            <Button variant="secondary" className="self-start" leadingIcon={<Plus size={14} aria-hidden />} disabled={!mayChange} title={mayChange ? undefined : VIEWER_CANNOT_CHANGE_TYPES} onClick={() => setDialog({ kind: 'add', state })}>
              Add column
            </Button>
          </section>
        ))}
      </div>
      {dialog?.kind === 'add' && (
        <ColumnNameDialog title={`A new column in ${TASK_STATE_LABELS[dialog.state]}`} initial="" confirm="Add column" onCancel={() => setDialog(null)}
          onConfirm={name => run('The column was not added', () => add({ typeId: type.id, name, state: dialog.state }))} />
      )}
      {dialog?.kind === 'rename' && (
        <ColumnNameDialog title={`Rename ${dialog.column.name}`} initial={dialog.column.name} confirm="Rename" onCancel={() => setDialog(null)}
          onConfirm={name => run(`${dialog.column.name} was not renamed`, () => update({ columnId: dialog.column.id, name }))} />
      )}
      {dialog?.kind === 'move' && (
        <MoveColumnDialog column={dialog.column} projectKey={projectKey} onCancel={() => setDialog(null)}
          onConfirm={state => run(`${dialog.column.name} was not moved`, () => move({ columnId: dialog.column.id, state }))} />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveColumnDialog column={dialog.column} onCancel={() => setDialog(null)}
          onConfirm={() => run(`${dialog.column.name} was not removed`, () => remove({ columnId: dialog.column.id }))} />
      )}
      {attention.dialog}
    </>
  )
}
