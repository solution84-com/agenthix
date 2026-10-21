import type { ReactNode } from 'react'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import { ColumnBar } from './ColumnBar'
import { SprintTag } from './SprintTag'
import { countsLine, daysLeftText, sprintDates } from './cardState'
import type { BoardListItem } from './types'

function BoardRow({ board, onOpen, action }: { board: BoardListItem; onOpen: () => void; action?: ReactNode }) {
  const sprint = board.currentSprint
  return (
    <li className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 hover:border-accent">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer space-y-1.5 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Open ${board.name}`}>
          <span className="flex items-center gap-2">
            <b className="truncate text-body font-semibold text-text-primary">{board.name}</b>
            {board.kind === 'PROJECT_TASKS' && <span className="text-micro text-text-muted">Default</span>}
            {board.kind === 'SPRINTS' && <span className="text-micro text-text-muted">Sprints</span>}
            {board.needsYouCount > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-warning/20 px-2 text-micro font-medium text-warning">
                {board.needsYouCount} {board.needsYouCount === 1 ? 'needs' : 'need'} you
              </span>
            )}
          </span>
          <ColumnBar backlogCount={board.backlogCount} columns={board.columns} />
          {sprint && (
            <span className="flex flex-wrap items-center gap-x-2 text-small text-text-secondary">
              <SprintTag sprint={sprint} />
              <span>{sprintDates(sprint.startDate, sprint.finishDate)} · {daysLeftText(sprint.daysLeft)}</span>
            </span>
          )}
          <span className="block text-small text-text-muted">{countsLine(board.backlogCount, board.columns)}</span>
        </button>
        {action}
      </div>
    </li>
  )
}

/**
 * The Boards tool's list (every screen reviewed spec §3): Project Tasks first, each board with a bar of how
 * many tasks sit in each column, its counts, a sprint board's current sprint, and how many need a person.
 * Archived is a button at the top; ＋ New adds a board.
 */
export function BoardsList({ boards, archivedCount, showingArchived, onOpen, onNew, onShowArchived, onShowActive, onUnarchive }: {
  boards: BoardListItem[]
  archivedCount: number
  showingArchived: boolean
  onOpen: (boardId: string) => void
  /** Absent where the person may not add a board. */
  onNew?: () => void
  onShowArchived: () => void
  onShowActive: () => void
  /** Absent where the person may not archive or restore boards. */
  onUnarchive?: (boardId: string) => void
}) {
  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        {showingArchived ? (
          <button type="button" className={TASK_BUTTON} onClick={onShowActive}>‹ Boards</button>
        ) : (
          <button type="button" className={TASK_BUTTON} onClick={onShowArchived}>
            Archived <span className="rounded-full bg-surface-2 px-1.5 text-micro text-text-secondary">{archivedCount}</span>
          </button>
        )}
        {!showingArchived && onNew && (
          <button type="button" className={`${TASK_BUTTON_PRIMARY} ml-auto`} onClick={onNew}>＋ New</button>
        )}
      </div>
      {showingArchived && <h4 className="px-4 pt-3 text-micro font-medium uppercase tracking-wide text-text-muted">Archived boards</h4>}
      {boards.length === 0 ? (
        <p className="px-4 py-4 text-small text-text-muted">{showingArchived ? 'No board is archived.' : 'No boards yet.'}</p>
      ) : (
        <ul className="space-y-2 px-4 pt-3">
          {boards.map(b => (
            <BoardRow
              key={b.id} board={b} onOpen={() => onOpen(b.id)}
              action={showingArchived && onUnarchive ? (
                <button type="button" className={TASK_BUTTON} onClick={() => onUnarchive(b.id)}>Unarchive</button>
              ) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
