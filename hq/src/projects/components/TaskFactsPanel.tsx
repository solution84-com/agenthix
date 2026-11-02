import { Link } from 'react-router'
import { AgentPicker, TaskFact } from '@agenthix/ui/tasks'
import { NativeSelect } from '@agenthix/ui/primitives'
import { TaskSchedulePanel } from '../../automation/pages/TaskSchedulePanel'
import { TaskPlanFacts } from './TaskPlanFacts'
import { TaskOnBehalfOfSection } from './TaskOnBehalfOfSection'
import { TaskAttachments } from './TaskAttachments'
import { TaskWorkingFiles } from './TaskWorkingFiles'
import { TaskWorkspaceSelect } from './TaskWorkspaceField'
import type { LocationRef } from '@agenthix/core'
import type { OpenTaskFile } from '../pages/useTasksToolUrl'
import type { useTaskDetail } from '../hooks/useTaskDetail'

type Detail = ReturnType<typeof useTaskDetail>

const day = (v: string | Date) => new Date(v).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** A task's facts (every screen reviewed spec §3): agent, board and column, priority, plan and epic, on whose behalf, start time, files, when it was created. */
/** The task's files: the one open beside it, its own folder, and how to open one. */
export interface TaskFilesFacts {
  opened: OpenTaskFile | null
  loc: LocationRef | null
  onOpen: (file: OpenTaskFile) => void
}

export function TaskFactsPanel({ detail, project, files }: { detail: Detail; project?: { key: string; name: string }; files?: TaskFilesFacts }) {
  const task = detail.task
  if (!task) return null
  const hasStages = !!task.boardId && detail.boardStages.length > 0
  return (
    <>
      {project && (
        <TaskFact label="Project"><Link to={`/projects/${project.key}`} className="text-accent hover:underline">{project.name}</Link></TaskFact>
      )}
      <TaskFact label="Agent">
        <AgentPicker currentAgentId={task.assignedAgentId ?? null} agents={detail.agents} onAssign={detail.handleAgentChange} />
      </TaskFact>
      <TaskFact label="Board">
        <div className="space-y-1.5">
          <NativeSelect size="sm" aria-label="Board" value={task.boardId ?? ''} onChange={e => detail.handleBoardChange(e.target.value || null)}>
            <option value="">Backlog</option>
            {detail.boards.map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
          {hasStages && (
            <NativeSelect size="sm" aria-label="Column" value={task.column ?? ''} onChange={e => detail.handleStageChange(e.target.value)}>
              {detail.boardStages.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
            </NativeSelect>
          )}
        </div>
      </TaskFact>
      <TaskFact label="Workspace">
        <TaskWorkspaceSelect projectId={task.projectId} taskId={task.id} onChange={detail.handleWorkspaceChange} />
      </TaskFact>
      <TaskFact label="Priority">
        <NativeSelect size="sm" aria-label="Priority" value={task.priority} onChange={e => detail.handlePriorityChange(e.target.value)}>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </NativeSelect>
      </TaskFact>
      <TaskPlanFacts task={task as never} onChanged={() => void detail.refetchTask()} />
      <TaskOnBehalfOfSection taskId={task.id} onChanged={() => void detail.refetchTask()} />
      <TaskSchedulePanel task={task as never} />
      <TaskFact label="Attachments">
        <TaskAttachments
          taskId={task.id}
          selected={files?.opened?.kind === 'attachment' ? files.opened.id : undefined}
          onOpen={files ? id => files.onOpen({ kind: 'attachment', id }) : undefined}
        />
      </TaskFact>
      {files?.loc && (
        <TaskWorkingFiles
          loc={files.loc}
          selected={files.opened?.kind === 'working' ? files.opened.path : undefined}
          onOpen={path => files.onOpen({ kind: 'working', path })}
        />
      )}
      <TaskFact label="Created">{task.createdAt ? day(task.createdAt) : '—'}</TaskFact>
    </>
  )
}
