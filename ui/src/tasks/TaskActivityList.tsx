import type { ReactNode } from 'react'
import { Archive, ArrowLeftRight, Check, CircleX, MessageSquare, Pencil, Play, Plus, Square, ThumbsDown, ThumbsUp, UserRound } from 'lucide-react'
import type { ActivityIcon, ActivityLine } from './taskActivityWords'
import { whenText } from './taskRunLines'
import { EmptyState } from '../primitives/EmptyState'

const ICON: Record<ActivityIcon, ReactNode> = {
  created: <Plus size={13} aria-hidden />,
  edited: <Pencil size={13} aria-hidden />,
  moved: <ArrowLeftRight size={13} aria-hidden />,
  assigned: <UserRound size={13} aria-hidden />,
  started: <Play size={13} aria-hidden />,
  finished: <Check size={13} aria-hidden className="text-success" />,
  failed: <CircleX size={13} aria-hidden className="text-danger" />,
  stopped: <Square size={12} aria-hidden />,
  approved: <ThumbsUp size={13} aria-hidden />,
  denied: <ThumbsDown size={13} aria-hidden />,
  comment: <MessageSquare size={13} aria-hidden />,
  archived: <Archive size={13} aria-hidden />,
}

export interface TaskActivityListProps {
  lines: ActivityLine[]
  /** Opens the line's tab: Runs at its run, Comments at its comment. */
  onOpen?: (opens: NonNullable<ActivityLine['opens']>) => void
  /** Older lines exist: *Show earlier activity*. */
  onMore?: () => void
  loading?: boolean
  now?: Date
}

/** A task's activity (T0, the Activity tab): newest first, one line each; a run's or a comment's line opens its tab. */
export function TaskActivityList({ lines, onOpen, onMore, loading, now = new Date() }: TaskActivityListProps) {
  if (loading && lines.length === 0) return <p className="text-small text-text-muted">Loading…</p>
  if (lines.length === 0) return <EmptyState variant="inline" title="Nothing has happened to this task yet." />
  return (
    <div className="space-y-2">
      <ol aria-label="Activity" className="space-y-0.5">
        {lines.map(l => (
          <li key={l.id} data-testid="activity-line" className="flex items-center gap-2 py-1 text-small text-text-secondary">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">{ICON[l.icon]}</span>
            <span className="min-w-0 flex-1 truncate">
              {l.text}
              {l.opens && onOpen && (
                <>
                  {' · '}
                  <button type="button" onClick={() => onOpen(l.opens!)} className="text-accent hover:underline">
                    {l.opens.tab === 'runs' ? 'See in Runs' : 'See in Comments'}
                  </button>
                </>
              )}
            </span>
            <span className="shrink-0 text-micro text-text-muted">{whenText(l.at, now)}</span>
          </li>
        ))}
      </ol>
      {onMore && (
        <button type="button" onClick={onMore} disabled={loading} className="text-small text-text-secondary hover:text-text-primary disabled:opacity-50">
          {loading ? 'Loading…' : 'Show earlier activity'}
        </button>
      )}
      <p className="text-micro text-text-muted">Newest first. Everything that happened to the task; a run's steps are in Runs, a comment's words in Comments.</p>
    </div>
  )
}
