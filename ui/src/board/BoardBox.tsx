import { useState } from 'react'
import { ChartGantt, Columns3 } from 'lucide-react'
import { TASK_BUTTON } from '../tasks/TasksToolParts'
import { SprintTag } from './SprintTag'
import { daysLeftText, sprintDates } from './cardState'
import type { PastSprint, SprintInfo } from './types'

export type BoardMode = 'columns' | 'timeline'

/**
 * "Columns · Timeline": the two ways to look at a board (spec §3, The Timeline tool), in the board's header.
 * Icons always; their words only when `labelled` (the board is wide enough). The header sits outside the board's
 * own box, so the board measures its width and says.
 */
export function ModeSwitch({ mode, onChange, labelled = true }: { mode: BoardMode; onChange: (mode: BoardMode) => void; labelled?: boolean }) {
  return (
    <div role="group" aria-label="View" className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border text-small">
      {(['columns', 'timeline'] as const).map(m => {
        const label = m === 'columns' ? 'Columns' : 'Timeline'
        const Icon = m === 'columns' ? Columns3 : ChartGantt
        return (
          <button
            key={m} type="button" aria-pressed={mode === m} aria-label={label} title={label} onClick={() => onChange(m)}
            className={`inline-flex items-center gap-1.5 px-2 py-1 ${mode === m ? 'bg-surface-3 font-medium text-text-primary' : 'text-text-muted hover:bg-surface-hover'}`}
          >
            <Icon size={14} aria-hidden />
            {labelled && <span>{label}</span>}
          </button>
        )
      })}
    </div>
  )
}

function RenameField({ sprint, onRename, onClose }: { sprint: SprintInfo; onRename: (name: string | null) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(sprint.name ?? '')
  const [error, setError] = useState('')
  const save = async () => {
    setError('')
    try {
      await onRename(name.trim() || null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus value={name} aria-label="Sprint name" placeholder={`Sprint ${sprint.number}`}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') onClose() }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button type="button" className={TASK_BUTTON} onClick={() => void save()}>Save</button>
        <button type="button" className={TASK_BUTTON} onClick={onClose}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}

/**
 * The box at the top of a board (every screen reviewed spec §3): a sprint board's current sprint with its
 * past sprints under ▾, its dates and days left, Finish sprint and Rename sprint. A board without sprints has no box;
 * the Columns · Timeline switch is in the board's header.
 */
export function BoardBox({ sprint, pastSprints, onOpenPast, viewingSprint, onViewSprint, onFinish, onRename }: {
  sprint: SprintInfo | null
  /** The sprints finished before; read when ▾ is opened. */
  pastSprints?: PastSprint[]
  onOpenPast?: () => void
  /** A past sprint being looked at, read-only. */
  viewingSprint?: SprintInfo | null
  onViewSprint?: (sprintId: string | null) => void
  /** Finish sprint and Rename sprint are offered only when given: someone who cannot change the board sees neither. */
  onFinish?: () => void
  onRename?: (name: string | null) => Promise<void>
}) {
  const [pastOpen, setPastOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  if (!sprint) return null
  const finished = (pastSprints ?? []).filter(s => s.finishedAt)

  return (
    <div className="mx-4 mt-3 space-y-2 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2">
      {sprint && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="relative inline-flex items-center gap-1">
            <SprintTag sprint={sprint} />
            <button
              type="button" aria-label="Past sprints" aria-haspopup="menu" aria-expanded={pastOpen}
              className="rounded px-1 text-text-muted hover:bg-surface-hover"
              onClick={() => { if (!pastOpen) onOpenPast?.(); setPastOpen(!pastOpen) }}
            >▾</button>
            {pastOpen && (
              <>
                <span className="fixed inset-0 z-10" onClick={() => setPastOpen(false)} />
                <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg">
                  {finished.length === 0 && <p className="px-3 py-2 text-small text-text-muted">{pastSprints ? 'No sprint is finished yet.' : 'Loading…'}</p>}
                  {finished.map(s => (
                    <button
                      key={s.id} type="button" role="menuitem"
                      className="block w-full px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover"
                      onClick={() => { setPastOpen(false); onViewSprint?.(s.id) }}
                    >
                      {s.label}
                      <span className="block text-micro text-text-muted">{sprintDates(s.startDate, s.finishDate)} · {s.doneCount} of {s.taskCount} done</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </span>
          <span className="text-small text-text-secondary">{sprintDates(sprint.startDate, sprint.finishDate)} · {daysLeftText(sprint.daysLeft)}</span>
        </div>
      )}
      {viewingSprint && (
        <p className="flex items-center gap-2 text-small text-text-secondary">
          Viewing {viewingSprint.label}, read-only.
          <button type="button" className="text-accent hover:underline" onClick={() => onViewSprint?.(null)}>Back to the current sprint</button>
        </p>
      )}
      {renaming && sprint && onRename && <RenameField sprint={sprint} onRename={onRename} onClose={() => setRenaming(false)} />}
      {!renaming && !viewingSprint && (onFinish || onRename) && (
        <div className="flex flex-wrap items-center gap-2">
          {onFinish && <button type="button" className={TASK_BUTTON} onClick={onFinish}>Finish sprint</button>}
          {onRename && <button type="button" className={TASK_BUTTON} onClick={() => setRenaming(true)}>Rename sprint</button>}
        </div>
      )}
    </div>
  )
}
