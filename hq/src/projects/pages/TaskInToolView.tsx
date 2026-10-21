import { useEffect, useRef, useState } from 'react'
import {
  useQuery, useAction, getTaskByKey, getSessionPendingManifest, approveManifest, archiveTask, deleteTask, updateTaskPlan,
} from 'wasp/client/operations'
import {
  TaskInTool, OverflowMenu, TasksViewHeader, TASK_BUTTON, TASK_BUTTON_PRIMARY,
  primaryAction, runNeedsPerson, type OverflowItem, type RunWaitNote,
} from '@agenthix/ui/tasks'
import type { PendingManifestData } from '@agenthix/ui/sessions'
import { InlineEdit } from '../../shared/components/ui/InlineEdit'
import { useTaskDetail } from '../hooks/useTaskDetail'
import { CommentsSection } from '../components/TaskPanel'
import { isManifestApprovalComment } from '../components/ManifestApprovalComment'
import { TaskNotices } from '../components/TaskNotices'
import { TaskFactsPanel } from '../components/TaskFactsPanel'
import { TaskWaiting } from '../components/TaskWaiting'
import { TaskThreadSection } from '../components/TaskThreadSection'
import { lostAccessRunNotice } from './taskHeldNotice'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

interface TaskView {
  id: string
  title: string
  description: string | null
  runState: string
  runStateReason: string | null
  isEpic?: boolean
  runWait: RunWaitNote | null
  assignedAgentId: string | null
  assignedAgent: { name: string } | null
  board: { name: string } | null
  project?: { key: string; name: string }
}

const ACTION_LABEL = { run: 'Run', stop: 'Stop', approve: 'Approve', runAgain: 'Run again' } as const

/**
 * One task inside the Tasks tool (every screen reviewed spec §3), the same for
 * every task: what it is, what waits in its session, its comments, its facts,
 * and the one action for the state it is in.
 */
export function TaskInToolView({ taskKey, focusWaiting, backLabel, onBack, onGone, onOpenSession, projectLink }: {
  taskKey: string
  focusWaiting: boolean
  /** What the way back is called; "Tasks" where it is not given. */
  backLabel?: string
  /** Absent on the task's own page, where the screen bar's breadcrumb is the way back. */
  onBack?: () => void
  /** Where to go when the task is archived or deleted. */
  onGone: () => void
  onOpenSession: () => void
  /** On the task's own page, its project is a fact; inside a project's tool it is the context. */
  projectLink?: boolean
}) {
  const { data: byKey, isLoading, error } = useQuery(getTaskByKey, { taskKey })
  const detail = useTaskDetail(byKey?.id)
  const task = detail.task as unknown as TaskView | null | undefined
  const session = detail.taskSession as { id: string; AgentRun?: unknown[] } | null | undefined
  const blocked = task ? runNeedsPerson(task.runState) : false
  const { data: pendingData, refetch: refetchPending } = useQuery(
    getSessionPendingManifest, session ? { sessionId: session.id } : undefined, { enabled: !!session && blocked },
  )
  const pending = (blocked ? pendingData ?? null : null) as PendingManifestData | null
  const approveFn = useAction(approveManifest)
  const archiveFn = useAction(archiveTask)
  const deleteFn = useAction(deleteTask)
  const planFn = useAction(updateTaskPlan)
  const [epicNotice, setEpicNotice] = useState('')
  const canChange = useMayWork(byKey?.projectId)
  const waitingRef = useRef<HTMLElement>(null)

  const liveCount = detail.liveComments.length
  const { refetchComments } = detail
  useEffect(() => { if (liveCount > 0) void refetchComments() }, [liveCount, refetchComments])
  useEffect(() => {
    if (focusWaiting && task) waitingRef.current?.scrollIntoView?.({ block: 'start' })
  }, [focusWaiting, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error || (!isLoading && !byKey)) {
    return (
      <div>
        <TasksViewHeader back={backLabel ?? 'Tasks'} onBack={onBack} />
        <p className="px-4 pt-3 text-small text-text-muted">That task was not found.</p>
      </div>
    )
  }
  if (!task) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const action = primaryAction({ runState: task.runState, hasPendingApproval: !!pending })
  const lostAccess = lostAccessRunNotice(task)
  const project = (byKey as { project?: { key: string; name: string } }).project
  const stages = detail.boardStages
  const column = stages.find(s => s.name === detail.task?.column)?.label ?? detail.task?.column ?? null
  const keyLine = [taskKey, task.isEpic ? 'Epic' : null, task.board?.name, column ?? 'Backlog'].filter(Boolean).join(' · ')

  const run = () => {
    if (action === 'approve' && pending) {
      void approveFn({ runId: pending.runId, sessionId: pending.sessionId }).then(() => { void refetchPending(); void detail.refetchTask() })
    } else if (action === 'stop') void detail.handleStopTask()
    else void detail.handleStartTask()
  }
  const actionDisabledReason = action !== 'stop' && action !== 'approve' && !task.assignedAgentId ? 'Assign an agent first' : undefined

  // Into the other board's Backlog (adr-0097).
  const moveItems: OverflowItem[] = canChange
    ? (detail.boards as { id: string; name: string }[])
        .filter(b => b.id !== detail.task?.boardId)
        .map(b => ({ label: `Move to board: ${b.name}`, onSelect: () => detail.handleBoardChange(b.id) }))
    : []
  // The server refuses to take the epic off one that still groups tasks, and says why.
  const setEpic = async (isEpic: boolean) => {
    setEpicNotice('')
    try {
      await planFn({ taskId: task.id, isEpic })
      void detail.refetchTask()
    } catch (e) {
      setEpicNotice(e instanceof Error ? e.message : 'That did not work')
    }
  }
  const menu: OverflowItem[] = [
    ...(canChange ? [{ label: task.isEpic ? 'Not an epic' : 'Make this an epic', onSelect: () => setEpic(!task.isEpic) }] : []),
    ...moveItems,
    ...(blocked && !lostAccess && canChange ? [{ label: 'Dismiss this run', onSelect: () => detail.handleDismissRun() }] : []),
    ...(session && canChange ? [{ label: 'Clear the session', confirmLabel: 'Confirm: clear the session', onSelect: () => detail.handleClearSession() }] : []),
    ...(canChange ? [
      { label: 'Archive', onSelect: async () => { await archiveFn({ taskId: task.id }); onGone() } },
      { label: 'Delete', danger: true, confirmLabel: 'Confirm: delete', onSelect: async () => { await deleteFn({ taskId: task.id }); onGone() } },
    ] : []),
  ]

  return (
    <TaskInTool
      onBack={onBack}
      backLabel={backLabel}
      keyLine={keyLine}
      title={<InlineEdit readOnly={!canChange} value={task.title} onSave={detail.handleSaveTitle} placeholder="Task title" textClassName="text-h2 font-semibold" />}
      description={
        <InlineEdit readOnly={!canChange} value={task.description ?? ''} onSave={detail.handleSaveDescription} multiline markdown placeholder="Add a description…" textClassName="text-body leading-relaxed" />
      }
      notices={
        <>
          {!canChange && <p className="text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>}
          <TaskNotices task={task} stopNotice={detail.stopNotice} />
          {epicNotice && <p role="alert" className="text-small text-danger">{epicNotice}</p>}
        </>
      }
      waiting={
        <TaskWaiting
          ref={waitingRef}
          session={session ? { id: session.id, agentName: task.assignedAgent?.name ?? 'Agent', runCount: session.AgentRun?.length ?? 0 } : null}
          pending={pending}
          onOpenSession={onOpenSession}
          onSettled={() => { void refetchPending(); void detail.refetchTask() }}
          readOnly={!canChange}
        />
      }
      comments={
        <>
        <TaskThreadSection taskId={task.id} taskKey={taskKey} />
        <CommentsSection
          taskComments={detail.taskComments.filter(c => !isManifestApprovalComment(c.content))}
          liveComments={[]}
          commentDraft={detail.commentDraft}
          setCommentDraft={detail.setCommentDraft}
          commentBusy={detail.commentBusy}
          commentTextareaRef={detail.commentTextareaRef}
          onAddComment={canChange ? () => void detail.handleAddComment() : undefined}
          sessionId={session?.id}
          placeholder={`Comment — everyone on the task sees it${task.assignedAgent ? `; ${task.assignedAgent.name} reads it on its next run` : ''}`}
        />
        </>
      }
      facts={<TaskFactsPanel detail={detail} project={projectLink ? project : undefined} />}
      action={
        !canChange || (lostAccess && action !== 'stop' && action !== 'approve') ? null : (
          <button
            type="button"
            className={action === 'approve' ? TASK_BUTTON_PRIMARY : TASK_BUTTON}
            disabled={detail.actionBusy || !!actionDisabledReason}
            title={actionDisabledReason}
            onClick={run}
          >
            {ACTION_LABEL[action]}
          </button>
        )
      }
      menu={<OverflowMenu items={menu} />}
    />
  )
}
