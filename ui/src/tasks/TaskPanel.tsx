import type { ReactNode } from 'react'
import { X, Maximize2 } from 'lucide-react'
import { InlineEdit } from '../primitives/InlineEdit'
import { TaskMetaSidebar } from './TaskMetaSidebar'
import { CommentsSection } from './CommentsSection'
import type { TaskDetailState } from './TaskDetailState'

// ── Types ─────────────────────────────────────────────────────────────

export interface TaskPanelProps {
  detail: TaskDetailState
  onClose: () => void
  onNavigateToFull?: () => void
  mode?: 'panel' | 'dialog'
  // Slot for site-specific content (e.g. agent session section).
  // Rendered in the left column between description and comments.
  SessionSlot?: ReactNode
  // Renderer for comment content — allows site to inject markdown/manifest
  // rendering while HQ defaults to plain text.
  renderCommentContent?: (content: string) => ReactNode
}

// ── Component ─────────────────────────────────────────────────────────

export function TaskPanel({
  detail,
  onClose,
  onNavigateToFull,
  mode = 'panel',
  SessionSlot,
  renderCommentContent,
}: TaskPanelProps) {
  const { task, taskLoading, agents, boards, taskSession: _ts, boardStages } = detail

  if (taskLoading) {
    return (
      <div
        className={`flex-1 flex items-center justify-center bg-surface-1 ${mode === 'panel' ? 'border-l border-border-subtle' : ''}`}
      >
        <span className="text-text-muted/70 text-small">Loading…</span>
      </div>
    )
  }

  if (!task) return null

  const contextLabel = [
    (task.board as any)?.name,
    boardStages.find((s) => s.name === task.stage)?.label ?? task.stage,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`flex flex-col bg-surface-1 h-full task-panel-enter ${mode === 'panel' ? 'border-l border-border-subtle' : ''}`}
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-subtle shrink-0 flex items-center gap-2 bg-surface-1">
        <span className="text-micro text-text-muted flex-1 truncate">{contextLabel || 'Task'}</span>
        {onNavigateToFull && (
          <button
            onClick={onNavigateToFull}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-micro font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover border border-border-subtle transition-colors shrink-0"
          >
            <Maximize2 size={11} />
            Full view
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Body — two-column Jira-style layout */}
      <div className="flex flex-1 min-h-0">

        {/* Left: main content */}
        <div
          className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-5"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* Title */}
          <InlineEdit
            value={task.title}
            onSave={detail.handleSaveTitle}
            placeholder="Task title"
            textClassName="text-h2 font-semibold"
          />

          {/* Description */}
          <div>
            <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70 px-3 mb-1">
              Description
            </p>
            <InlineEdit
              value={task.description ?? ''}
              onSave={detail.handleSaveDescription}
              multiline
              placeholder="Add a description…"
              textClassName="text-body leading-relaxed"
            />
          </div>

          <div className="border-t border-border-subtle" />

          {/* Site-specific session section */}
          {SessionSlot}

          {SessionSlot && <div className="border-t border-border-subtle" />}

          {/* Comments */}
          <CommentsSection
            comments={[...detail.taskComments, ...detail.liveComments.filter(
              (lc) => !detail.taskComments.find((tc) => tc.id === lc.id)
            )]}
            renderContent={renderCommentContent
              ? (c) => renderCommentContent((c as any).content ?? '')
              : undefined
            }
            commentDraft={detail.commentDraft}
            setCommentDraft={detail.setCommentDraft}
            commentBusy={detail.commentBusy}
            commentTextareaRef={detail.commentTextareaRef}
            onAddComment={() => void detail.handleAddComment()}
          />
        </div>

        {/* Right: metadata sidebar */}
        <TaskMetaSidebar
          boardId={task.boardId}
          boards={boards}
          onBoardChange={detail.handleBoardChange}
          status={task.status}
          stage={task.stage}
          boardStages={boardStages}
          onStageChange={detail.handleStageChange}
          onStatusChange={detail.handleStatusChange}
          priority={task.priority}
          onPriorityChange={(p) => detail.handlePriorityChange(p)}
          assignedAgentId={task.assignedAgentId}
          agents={agents}
          onAgentChange={detail.handleAgentChange}
          confirmArchive={detail.confirmArchive}
          onArchive={() => detail.handleArchive(onClose)}
          confirmDelete={detail.confirmDelete}
          onDelete={() => detail.handleDelete(onClose)}
        />
      </div>
    </div>
  )
}
