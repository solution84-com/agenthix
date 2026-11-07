import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  useQuery, useAction, getTaskByKey, getSessionPendingManifest, archiveTask, unarchiveTask, deleteTask, updateTaskPlan,
} from 'wasp/client/operations'
import { TaskInTool, OverflowMenu, TasksViewHeader, runNeedsPerson, runWaitText } from '@agenthix/ui/tasks'
import { Plus, Square } from 'lucide-react'
import { Button, EmptyState, copyText, dayLabel, COPY_FAILED_WORDS } from '@agenthix/ui/primitives'
import type { PendingManifestData } from '@agenthix/ui/sessions'
import { useTaskDetail } from '../hooks/useTaskDetail'
import { taskEmbed } from '../components/TaskPanel'
import { TaskRecordTabs } from '../components/TaskRecordTabs'
import { EpicTasks } from '../components/TaskEpic'
import { taskEmbedOpeners, taskFileAddress } from '../components/taskEmbedOpen'
import { isManifestApprovalComment } from '../components/ManifestApprovalComment'
import { TaskFactsPanel, type TaskChange } from '../components/TaskFactsPanel'
import { TaskWaiting } from '../components/TaskWaiting'
import { TaskThreadSection, useTalkAboutTask } from '../components/TaskThreadSection'
import { TaskBesideFile } from '../components/TaskBesideFile'
import { TaskOpenedFile } from '../components/TaskOpenedFile'
import { TaskHeader } from '../components/TaskHeader'
import { TaskNow } from '../components/TaskNow'
import { TaskTitleField, TaskDescriptionField } from '../components/TaskTextFields'
import { TaskDeleteDialog, TaskGone } from '../components/TaskDeleteDialog'
import { EpicPage, useEpicPage } from '../components/TaskEpicPage'
import { useTaskHelp } from '../components/TaskHelp'
import { taskPageMenu } from '../components/taskPageMenu'
import {
  taskPageWords, headerButton, nowKind, latestRun, runCountOf, tasksListPath, type PageRun,
} from '../components/taskPageState'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'
import { useAttention } from '../../shared/components/AttentionDialog'
import { taskLocation } from '../hooks/useTaskFiles'
import type { OpenTaskFile } from './useTasksToolUrl'
import { heldTaskNotice, lostAccessRunNotice } from './taskHeldNotice'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

interface TaskView {
  id: string
  title: string
  description: string | null
  status: string
  runState: string
  runStateReason: string | null
  result: string | null
  isEpic?: boolean
  archived?: boolean
  priority: string
  planStart?: string | Date | null
  runWait: Parameters<typeof runWaitText>[0]
  assignedAgentId: string | null
  assignedAgent: { name: string } | null
  column: string | null
  projectId: string
}

const BUTTON_LABEL = { run: 'Run', stop: 'Stop', runAgain: 'Run again' } as const

/**
 * A task's page (T0, T9, T10), the same inside the Tasks tool and on its own: the header kept in view, the title and
 * description edited in place, Now, the tabs, and the Details beside them. An epic shows its progress and its tasks.
 */
export function TaskInToolView({ taskKey, focusWaiting, backLabel, onBack, onGone, onOpenSession, projectLink, openFile, onOpenFile }: {
  taskKey: string
  focusWaiting: boolean
  /** What the way back is called; "Tasks" where it is not given. */
  backLabel?: string
  /** Absent on the task's own page, where the screen bar's breadcrumb is the way back. */
  onBack?: () => void
  /** Where to go when the task is archived or deleted, and from a task that is gone. */
  onGone: () => void
  onOpenSession: () => void
  /** On the task's own page, its project is a fact; inside a project's tool it is the context. */
  projectLink?: boolean
  /** The task's file open beside it (spec part 3, *A task's files*), kept by the caller in the address. */
  openFile?: OpenTaskFile | null
  /** Opens one of the task's files beside it, or closes it (null). Without it, files only download. */
  onOpenFile?: (file: OpenTaskFile | null) => void
}) {
  const [, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: byKey, isLoading, error, refetch: refetchTask } = useQuery(getTaskByKey, { taskKey })
  // Not found (or not this person's to see) is the gone page; any other failure is a read that can be tried again.
  const status = (error as { statusCode?: number } | null)?.statusCode
  const readFailed = !!error && status !== 404 && status !== 400 && status !== 403
  const detail = useTaskDetail(byKey?.id)
  const task = detail.task as TaskView | null | undefined
  const session = detail.taskSession as { id: string; AgentRun?: unknown[] } | null | undefined
  const blocked = task ? runNeedsPerson(task.runState) : false
  const { data: pendingData, refetch: refetchPending } = useQuery(
    getSessionPendingManifest, session ? { sessionId: session.id } : undefined, { enabled: !!session && blocked },
  )
  const pending = (blocked ? pendingData ?? null : null) as PendingManifestData | null
  const archiveFn = useAction(archiveTask)
  const unarchiveFn = useAction(unarchiveTask)
  const deleteFn = useAction(deleteTask)
  const planFn = useAction(updateTaskPlan)
  const canChange = useMayWork(byKey?.projectId)
  const attention = useAttention()
  const help = useTaskHelp(byKey?.id ?? '', taskKey, attention.show)
  const talk = useTalkAboutTask(byKey?.id ?? '', taskKey)
  const epic = useEpicPage(task?.isEpic ? task : null, byKey?.project?.key ?? taskKey.split('-')[0])
  const [deleting, setDeleting] = useState<'asked' | 'busy' | null>(null)
  const [deleted, setDeleted] = useState(false)
  const nowRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const now = new Date()

  const liveCount = detail.liveComments.length
  const { refetchComments } = detail
  useEffect(() => { if (liveCount > 0) void refetchComments() }, [liveCount, refetchComments])
  useEffect(() => {
    if (focusWaiting && task) nowRef.current?.scrollIntoView?.({ block: 'start' })
  }, [focusWaiting, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop's outcome is the task's new state; only a failure asks for attention.
  const { stopNotice, handleStopTask } = detail
  useEffect(() => {
    if (stopNotice?.kind === 'error') attention.show({ title: 'The task wasn’t stopped', text: stopNotice.text, retry: () => void handleStopTask() })
  }, [stopNotice]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (readFailed) attention.show({ title: `${taskKey} could not be read`, text: 'HQ did not answer. Nothing was changed.', retry: () => void refetchTask() })
  }, [readFailed]) // eslint-disable-line react-hooks/exhaustive-deps

  const backToList = () => (onBack ? onBack() : navigate(tasksListPath(taskKey)))
  if (readFailed) {
    return (
      <div className="px-4 py-4">
        <EmptyState variant="inline" title={`${taskKey} could not be read.`} action={<Button variant="secondary" onClick={() => void refetchTask()}>Try again</Button>} />
        {attention.dialog}
      </div>
    )
  }
  if (deleted || error || (!isLoading && !byKey) || (byKey && task === null && !detail.taskLoading)) {
    return (
      <div>
        {onBack && <TasksViewHeader back={backLabel ?? 'Tasks'} onBack={onBack} />}
        <TaskGone onBack={backToList} />
      </div>
    )
  }
  // While it loads, the header keeps its place, so the page does not jump when the task arrives.
  if (!task) return <TaskHeader taskKey={taskKey} keyInTopBar={!onBack} state={{ text: 'Loading…', tone: 'muted' }} column="…" />

  const change: TaskChange = (what, work) => {
    void work().then(() => detail.refetchTask(), (e: unknown) => attention.show({
      title: `${what} wasn’t changed`,
      text: `${e instanceof Error && e.message ? e.message : 'That did not work.'} Nothing was changed.`,
      retry: () => change(what, work),
    }))
  }
  const runs = (detail.taskRuns ?? null) as PageRun[] | null
  const latest = latestRun(runs)
  const words = taskPageWords(task, { hasPendingApproval: !!pending, readOnly: !canChange, runs, now })
  const button = headerButton(words, task)
  const lostAccess = lostAccessRunNotice(task)
  const project = (byKey as { project?: { id: string; key: string; name: string; personalSpace?: boolean; personalOwnerId?: string | null } }).project
  const loc = taskLocation(project, task.id)
  const openers = taskEmbedOpeners({
    taskId: task.id, taskKey, go: navigate,
    // Without a place to open it beside, a file opens on the task's own page.
    openBeside: file => (onOpenFile ? onOpenFile(file) : navigate(taskFileAddress(taskKey, file))),
  })
  const embed = taskEmbed(byKey?.projectId, task.id, { key: taskKey, personalSpace: project?.personalSpace, personalOwnerId: project?.personalOwnerId, openers })
  const comments = detail.taskComments.filter(c => !isManifestApprovalComment(c.content))
  const seeRuns = () => {
    setParams(p => { const q = new URLSearchParams(p); q.set('tab', 'runs'); q.delete('comment'); return q }, { replace: true })
    tabsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const refresh = () => { void refetchPending(); void detail.refetchTask(); void detail.refetchRuns() }

  const start = () => change('The task', async () => { await detail.handleStartTask(); void detail.refetchRuns() })
  const stop = () => void detail.handleStopTask()

  const remove = async () => {
    setDeleting('busy')
    try {
      await deleteFn({ taskId: task.id })
      setDeleting(null)
      setDeleted(true)
      onGone()
    } catch (e) {
      setDeleting('asked')
      attention.show({ title: `${taskKey} wasn’t deleted`, text: `${e instanceof Error ? e.message : 'That did not work.'} Nothing was changed.`, retry: () => void remove() })
    }
  }
  const archive = () => change('The task', async () => { setDeleting(null); await archiveFn({ taskId: task.id }); onGone() })
  const talkLabel = task.isEpic ? 'Talk about this epic' : 'Talk about this task'
  const menu = [
    // On a phone the header has no room for Talk: it is the first of ⋯.
    ...(talk ? [{ label: talkLabel, onSelect: talk.open, disabledReason: talk.refusal ?? undefined, phoneOnly: true }] : []),
    ...taskPageMenu(
    { canChange, isEpic: !!task.isEpic, hasAgent: !!task.assignedAgentId, archived: !!task.archived, runAgain: words.kind === 'done' && !task.isEpic },
    {
      setEpic: isEpic => change('The task', () => planFn({ taskId: task.id, isEpic })),
      copyLink: () => void copyText(`${window.location.origin}/tasks/${taskKey}`).then(ok => { if (!ok) attention.show({ text: COPY_FAILED_WORDS }) }),
      archive,
      unarchive: () => change('The task', () => unarchiveFn({ taskId: task.id })),
      runAgain: start,
      askDelete: () => setDeleting('asked'),
    },
  )]

  // A Viewer sees the button greyed, with why; a task with no agent says to assign one first.
  const refusal = !canChange ? VIEWER_CANNOT_WORK : undefined
  const primary = task.isEpic
    ? <Button leadingIcon={<Plus size={14} aria-hidden />} disabled={!canChange} title={refusal} onClick={() => navigate(epic.addHref)}>Add a task</Button>
    : button && !(lostAccess && button !== 'stop') && (
      <Button
        // While a request waits, its Approve in Now is the page's one filled button.
        variant={pending ? 'secondary' : 'primary'}
        leadingIcon={button === 'stop' ? <Square size={12} aria-hidden /> : undefined}
        disabled={!canChange || detail.actionBusy || (button !== 'stop' && !task.assignedAgentId)}
        title={refusal ?? (button !== 'stop' && !task.assignedAgentId ? 'Assign an agent first' : undefined)}
        onClick={button === 'stop' ? stop : start}
      >
        {BUTTON_LABEL[button]}
      </Button>
    )
  const columnOptions = [{ value: '', label: 'Backlog' }, ...detail.boardStages.map(s => ({ value: s.name, label: s.label }))]
  const view = (
    <>
      <TaskInTool
        onBack={onBack} backLabel={backLabel}
        header={
          <TaskHeader
            taskKey={taskKey}
            epic={!!task.isEpic}
            keyInTopBar={!onBack}
            state={task.isEpic ? { text: 'Epic', tone: 'muted' } : { text: words.text, tone: words.tone, title: words.fullReason }}
            column={{ value: task.column ?? '', options: columnOptions, onChange: canChange ? v => change('The column', () => detail.moveToColumn(v || null)) : undefined }}
            agentName={task.isEpic ? null : task.assignedAgent?.name}
            talk={<TaskThreadSection taskId={task.id} taskKey={taskKey} label={task.isEpic ? 'Talk about this epic' : undefined} />}
            primary={primary || null}
            menu={<OverflowMenu items={menu} />}
          />
        }
        title={<TaskTitleField value={task.title} readOnly={!canChange} onSave={detail.handleSaveTitle} />}
        description={<TaskDescriptionField value={task.description ?? ''} readOnly={!canChange} embed={embed} onSave={detail.handleSaveDescription} help={help} />}
        now={
          <div ref={nowRef}>
            {task.isEpic ? <EpicPage.Progress epic={epic} now={now} /> : (
              <TaskNow
                kind={nowKind(words, task, latest)} words={words} latest={latest} result={task.result}
                agentName={task.assignedAgent?.name ?? null} now={now} readOnly={!canChange} busy={detail.actionBusy}
                waitText={heldTaskNotice(task) ?? runWaitText(task.runWait)}
                noRetryReason={lostAccess}
                approval={
                  <TaskWaiting
                    session={session ? { id: session.id, agentName: task.assignedAgent?.name ?? 'Agent', runCount: runCountOf(runs) } : null}
                    pending={pending} onOpenSession={onOpenSession} onSettled={refresh} readOnly={!canChange}
                  />
                }
                onDismiss={() => change('The run', () => detail.handleDismissRun())}
                onSeeRun={seeRuns}
                renderMarkdown={text => <MarkdownMessage content={text} className="text-reading" embed={embed} />}
              />
            )}
          </div>
        }
        tabs={
          <div ref={tabsRef} className="scroll-mt-14">
            <TaskRecordTabs
              task={{ ...task, key: taskKey, projectId: byKey?.projectId }} canChange={canChange} embed={embed}
              tasks={task.isEpic ? { count: epic.tasks.length, content: <EpicTasks epicId={task.id} projectId={task.projectId} now={now} /> } : undefined}
            />
          </div>
        }
        details={
          <TaskFactsPanel
            detail={detail} project={projectLink ? project : undefined} change={change} canChange={canChange}
            files={onOpenFile ? { opened: openFile ?? null, loc, onOpen: onOpenFile } : undefined}
          />
        }
        detailsSummary={[task.isEpic ? null : task.assignedAgent?.name, task.priority.charAt(0) + task.priority.slice(1).toLowerCase(), task.planStart ? dayLabel(new Date(task.planStart)) : null].filter(Boolean).join(' · ')}
      />
      <TaskDeleteDialog
        open={deleting !== null} busy={deleting === 'busy'} taskKey={taskKey} title={task.title}
        comments={comments.length} runs={runCountOf(runs)} conversation={!!help?.hasConversation}
        onCancel={() => setDeleting(null)} onArchive={archive} onDelete={() => void remove()}
      />
      {attention.dialog}
    </>
  )
  if (!onOpenFile) return view
  return (
    <TaskBesideFile
      task={view}
      file={openFile ? layout => (
        <TaskOpenedFile
          file={openFile} taskId={task.id} taskKey={taskKey} loc={loc} layout={layout}
          onClose={() => onOpenFile(null)} onOpenWorking={path => onOpenFile({ kind: 'working', path })}
        />
      ) : null}
    />
  )
}
