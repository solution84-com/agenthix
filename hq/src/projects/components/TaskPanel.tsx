import { useNavigate } from 'react-router'
import {
  TaskPanel as UITaskPanel,
  AgentPicker,
  CommentsSection as UICommentsSection,
  type CommentLike,
} from '@agenthix/ui/tasks'
import { useTaskDetail } from '../hooks/useTaskDetail'
import { TaskSessionSection } from './TaskSessionSection'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { taskEmbedOpeners, taskFileAddress } from './taskEmbedOpen'
import { ManifestApprovalComment, isManifestApprovalComment } from './ManifestApprovalComment'

/** What a task's text needs of its task beyond its ids: its key, and whether its project is its person's Your space. */
export interface TaskEmbedFacts {
  key?: string
  personalSpace?: boolean | null
  personalOwnerId?: string | null
  /** What a click on an embedded file does; without it an embed is shown and a click opens nothing. */
  openers?: Pick<MarkdownEmbedContext, 'onOpen' | 'onOpenTaskFile'>
}

/**
 * A task's text resolves images and file links in the task's own folder of its project; `files/…`, `artefacts/…` and
 * `workspaces/<id>/…` in its project's storage (in its person's own for a task of Your space, which works there), and
 * `attachments/<its key>/<file>` to one of its own attachments.
 */
export function taskEmbed(projectId: string | undefined, taskId: string | undefined, facts: TaskEmbedFacts = {}): MarkdownEmbedContext | undefined {
  if (!projectId || !taskId) return undefined
  const siblings = facts.personalSpace && facts.personalOwnerId
    ? { ownerType: 'user' as const, ownerId: facts.personalOwnerId }
    : { ownerType: 'project' as const, ownerId: projectId }
  return {
    place: {
      space: 'place', loc: { ownerType: 'project', ownerId: projectId, workspaceId: null, taskId }, siblings,
      ...(facts.key ? { task: { id: taskId, key: facts.key } } : {}),
    },
    folder: '',
    ...facts.openers,
  }
}

// AgentButton is a thin re-export so existing call sites keep working.
export const AgentButton = AgentPicker

// ── CommentsSection ───────────────────────────────────────────────────
// Site-specific wrapper that injects markdown + manifest-approval rendering.

interface SiteComment extends CommentLike {
  content: string
}

export function CommentsSection({
  taskComments,
  liveComments,
  commentDraft,
  setCommentDraft,
  commentBusy,
  commentTextareaRef,
  onAddComment,
  sessionId,
  placeholder,
  embed,
}: {
  taskComments: SiteComment[]
  liveComments: SiteComment[]
  commentDraft: string
  setCommentDraft: (v: string) => void
  commentBusy: boolean
  commentTextareaRef: React.RefObject<HTMLTextAreaElement | null>
  /** Left out where the person may not comment (a project Viewer): no comment box. */
  onAddComment?: () => void
  /** The task's own session — a manifest-approval comment's run always belongs to it. */
  sessionId?: string
  placeholder?: string
  /** The place comments' images and file links resolve in. */
  embed?: MarkdownEmbedContext
}) {
  const persistedIds = new Set(taskComments.map((c) => c.id))
  const merged: SiteComment[] = [
    ...taskComments,
    ...liveComments.filter((c) => !persistedIds.has(c.id)),
  ]
  return (
    <UICommentsSection<SiteComment>
      comments={merged}
      filterComment={(c) => !c.content?.startsWith('__MANIFEST_REJECTED__:')}
      renderContent={(c) =>
        // sessionId may still be loading when the comment list first renders —
        // passed through as '' rather than gating the card on it, so the card
        // itself (not this raw JSON payload) is what a loading gap shows;
        // getRunManifestStatus refuses an empty sessionId and the card treats
        // that the same as "not yet resolved".
        isManifestApprovalComment(c.content)
          ? <ManifestApprovalComment content={c.content} sessionId={sessionId ?? ''} />
          : <MarkdownMessage content={c.content} className="text-reading" embed={embed} />
      }
      commentDraft={commentDraft}
      setCommentDraft={setCommentDraft}
      commentBusy={commentBusy}
      commentTextareaRef={commentTextareaRef}
      onAddComment={onAddComment}
      placeholder={placeholder}
    />
  )
}

// ── TaskPanel (slot) ──────────────────────────────────────────────────
// Wraps useTaskDetail + site-specific slots, renders @agenthix/ui TaskPanel.
// Also exported as TaskPanel for backward-compat with non-board consumers.

interface TaskPanelProps {
  taskId: string
  onClose: () => void
  mode?: 'panel' | 'dialog'
}

export function TaskPanel({ taskId, onClose, mode = 'panel' }: TaskPanelProps) {
  const navigate = useNavigate()
  const detail = useTaskDetail(taskId)
  const { task, taskSession } = detail
  const taskKey = task
    ? `${(task as any).project?.key}-${(task as any).number}`
    : undefined
  const project = (task as { project?: { personalSpace?: boolean; personalOwnerId?: string | null } } | null)?.project
  // The slide-in has no room beside the task: a file opens on the task's own page.
  const openers = task && taskKey
    ? taskEmbedOpeners({ taskId: task.id, taskKey, openBeside: file => navigate(taskFileAddress(taskKey, file)), go: navigate })
    : undefined
  const embed = taskEmbed((task as { projectId?: string } | null)?.projectId, task?.id, {
    key: taskKey, personalSpace: project?.personalSpace, personalOwnerId: project?.personalOwnerId, openers,
  })

  return (
    <UITaskPanel
      detail={detail}
      onClose={onClose}
      mode={mode}
      onNavigateToFull={taskKey ? () => navigate(`/tasks/${taskKey}`) : undefined}
      SessionSlot={
        task ? (
          <TaskSessionSection
            task={task as any}
            taskSession={taskSession as any}
            onStart={detail.handleStartTask}
            onStop={detail.handleStopTask}
            onDismiss={detail.handleDismissRun}
            actionBusy={detail.actionBusy}
            stopNotice={detail.stopNotice}
          />
        ) : undefined
      }
      renderCommentContent={(content) =>
        isManifestApprovalComment(content)
          ? <ManifestApprovalComment content={content} sessionId={taskSession?.id ?? ''} />
          : <MarkdownMessage content={content} className="text-reading" embed={embed} />
      }
    />
  )
}
