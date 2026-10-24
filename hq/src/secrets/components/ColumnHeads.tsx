import { ROW_GRID } from './SecretRow'

/** The columns' names, on a wide window; a phone shows each row as a card. */
export function ColumnHeads() {
  return (
    <div aria-hidden className={`px-3 text-micro font-semibold uppercase tracking-wide text-text-muted max-lg:hidden ${ROW_GRID}`}>
      <span>Name</span><span>Value</span><span>Used by</span><span>Changed</span><span />
    </div>
  )
}
