import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AgentPicker, TaskFact } from '@agenthix/ui/tasks'
import { NativeSelect, dayLabel } from '@agenthix/ui/primitives'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { TaskSchedulePanel } from '../../automation/pages/TaskSchedulePanel'
import { TaskModelField } from '../../models-settings/components/TaskModelField'
import { TaskPlanFacts } from './TaskPlanFacts'
import { TaskOnBehalfOfSection } from './TaskOnBehalfOfSection'
import { TaskAttachments } from './TaskAttachments'
import { TaskWorkingFiles } from './TaskWorkingFiles'
import { TaskWorkspaceSelect } from './TaskWorkspaceField'
import type { LocationRef } from '@agenthix/core'
import type { OpenTaskFile } from '../pages/useTasksToolUrl'
import type { useTaskDetail } from '../hooks/useTaskDetail'

type Detail = ReturnType<typeof useTaskDetail>

/** The task's files: the one open beside it, its own folder, and how to open one. */
export interface TaskFilesFacts {
  opened: OpenTaskFile | null
  loc: LocationRef | null
  onOpen: (file: OpenTaskFile) => void
}

/** Runs a change; a failure opens the centred dialog, with Try again. */
export type TaskChange = (what: string, work: () => Promise<unknown>) => void

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name} className="space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-small font-semibold text-text-primary">{name}</h3>
      {children}
    </section>
  )
}

/**
 * A task's Details (T0, T10), in four groups: Who (agent, model under it), Where (board, workspace; the column is the
 * header's chip), When
 * (plan, start and repeat; an epic's milestone) and About (priority, epic, for, files, created). An epic is not run,
 * so it has no Who, no epic of its own, no start time and no files of a run.
 */
export function TaskFactsPanel({ detail, project, files, change, canChange }: {
  detail: Detail
  project?: { key: string; name: string }
  files?: TaskFilesFacts
  change: TaskChange
  canChange: boolean
}) {
  const task = detail.task
  if (!task) return null
  const isEpic = !!task.isEpic
  const refetch = () => void detail.refetchTask()
  const modelChoice = (task as { modelChoice?: string | null }).modelChoice
  // A refusal known in advance: the field greyed, with why as its tooltip.
  const why = canChange ? undefined : VIEWER_CANNOT_WORK
  return (
    <>
      {!isEpic && (
        <Group name="Who">
          <TaskFact label="Agent">
            <AgentPicker currentAgentId={task.assignedAgentId ?? null} agents={detail.agents} disabled={!canChange} disabledReason={why} onAssign={id => change('The agent', () => detail.patch({ assignedAgentId: id || null }))} />
          </TaskFact>
          {/* The task's model shows once its read carries the choice. */}
          {modelChoice !== undefined && (
            <div title={why}><TaskModelField
              projectId={task.projectId} agentId={task.assignedAgentId} value={modelChoice ?? ''} disabled={!canChange}
              onChange={v => change('The model', () => detail.patch({ modelChoice: v || null }))}
            /></div>
          )}
        </Group>
      )}
      <Group name="Where">
        {project && (
          <TaskFact label="Project"><Link to={`/projects/${project.key}`} className="text-accent hover:underline">{project.name}</Link></TaskFact>
        )}
        <TaskFact label="Board">
          <NativeSelect
            size="sm" aria-label="Board" title={why} value={task.boardId ?? ''} disabled={!canChange}
            onChange={e => change('The board', () => detail.moveToBoard(e.target.value))}
          >
            {detail.boards.map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
        </TaskFact>
        {!isEpic && (
          <TaskFact label="Workspace">
            <TaskWorkspaceSelect
              projectId={task.projectId} taskId={task.id} disabled={!canChange} title={why}
              onChange={id => change('The workspace', () => detail.patch({ workspaceId: id }))}
            />
          </TaskFact>
        )}
      </Group>
      <Group name="When">
        {isEpic && <TaskPlanFacts task={task as never} onChanged={refetch} part="link" />}
        <TaskPlanFacts task={task as never} onChanged={refetch} part="dates" />
        {!isEpic && <TaskSchedulePanel task={task as never} />}
      </Group>
      <Group name="About">
        <TaskFact label="Priority">
          <NativeSelect
            size="sm" aria-label="Priority" title={why} value={task.priority} disabled={!canChange}
            onChange={e => change('The priority', () => detail.patch({ priority: e.target.value }))}
          >
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </NativeSelect>
        </TaskFact>
        {!isEpic && <TaskPlanFacts task={task as never} onChanged={refetch} part="link" />}
        <TaskOnBehalfOfSection taskId={task.id} onChanged={refetch} />
        <TaskFact label="Files">
          <TaskAttachments
            taskId={task.id} disabledReason={why}
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
        <TaskFact label="Created">{task.createdAt ? dayLabel(new Date(task.createdAt as string | Date)) : '—'}</TaskFact>
      </Group>
    </>
  )
}
