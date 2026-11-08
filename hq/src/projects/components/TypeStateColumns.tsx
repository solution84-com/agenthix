import { TASK_STATES, TASK_STATE_LABELS, type BoardColour, type TaskState } from '@agenthix/core'

/** A column, wherever a type's columns are listed: its name, and the state it sits in. */
export type StateColumn = { name: string; state: TaskState; colour?: BoardColour }

/** A column's colour as a design token; a colour this side does not know is drawn as neutral. */
export const COLUMN_SWATCH: Record<BoardColour, string> = {
  neutral: 'bg-text-muted', accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger',
}

/** A column's colour in words, for the menu that picks it. */
export const COLUMN_COLOUR_WORDS: Record<BoardColour, string> = {
  neutral: 'Grey', accent: 'Accent', success: 'Green', warning: 'Amber', danger: 'Red',
}

export function columnsInState<C extends StateColumn>(columns: readonly C[], state: TaskState): C[] {
  return columns.filter(c => c.state === state)
}

/** A column's name as a chip: the one look of a column wherever a type's columns are listed. */
export function ColumnChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full bg-surface-1 px-2 text-micro leading-[18px] text-text-primary shadow-[inset_0_0_0_1px_var(--color-border)]">
      {name}
    </span>
  )
}

function Chips({ columns }: { columns: readonly StateColumn[] }) {
  return <div className="flex min-w-0 flex-wrap gap-1">{columns.map(c => <ColumnChip key={c.name} name={c.name} />)}</div>
}

/**
 * A type's columns read across the four task states, one cell per state (spec D10): for a grid row whose next four
 * tracks are Backlog, To do, In progress and Done.
 */
export function StateColumnCells({ columns }: { columns: readonly StateColumn[] }) {
  return <>{TASK_STATES.map(state => <Chips key={state} columns={columnsInState(columns, state)} />)}</>
}

/** The same on a phone: a line per state, its name, then its columns. */
export function StateColumnLines({ columns }: { columns: readonly StateColumn[] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
      {TASK_STATES.map(state => (
        <div key={state} className="contents">
          <dt className="text-micro text-text-muted">{TASK_STATE_LABELS[state]}</dt>
          <dd><Chips columns={columnsInState(columns, state)} /></dd>
        </div>
      ))}
    </dl>
  )
}

/** Inline, as a template's card or a list item draws it: each state small, its columns as chips after it. */
export function StateColumnsInline({ columns }: { columns: readonly StateColumn[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {TASK_STATES.map(state => (
        <span key={state} className="inline-flex min-w-0 items-center gap-1.5">
          <span className="text-micro text-text-muted">{TASK_STATE_LABELS[state]}</span>
          <Chips columns={columnsInState(columns, state)} />
        </span>
      ))}
    </div>
  )
}
