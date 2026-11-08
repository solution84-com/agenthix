import type { ReactNode } from 'react'
import { AgentPicker, TaskFact } from '@agenthix/ui/tasks'
import { NativeSelect } from '@agenthix/ui/primitives'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { TaskModelField } from '../../models-settings/components/TaskModelField'
import { TaskPlanFacts } from './TaskPlanFacts'
import { TaskOnBehalfOfSection } from './TaskOnBehalfOfSection'
import { TaskAttachments } from './TaskAttachments'
import { TaskWorkingFiles } from './TaskWorkingFiles'
import { TaskWorkspaceSelect } from './TaskWorkspaceField'
import { TaskSprintFact } from './TaskSprintFact'
import { TaskFieldFacts, useTaskFields } from './TaskFieldFacts'
import { startsText } from './TaskRunAt'
import type { TaskPlace } from './TaskPlacement'
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
 * A task's Details (TK1), in groups: Who (its agent, the model under it), Plan (type, column, sprint, epic; the
 * rank is never a field: D14), When (due, and when Run at… starts it), Fields (the project's custom fields, when it
 * has any: D4) and About (priority, for, workspace, files). An
 * epic is never run, so its agent manages it and it has no model, start time, epic, workspace or files of a run; it
 * keeps its milestone.
 */
export function TaskFactsPanel({ detail, place, files, change, canChange, onRunAt }: {
  detail: Detail
  place: TaskPlace
  files?: TaskFilesFacts
  change: TaskChange
  canChange: boolean
  /** Opens Run at…; absent on an epic. */
  onRunAt?: () => void
}) {
  const task = detail.task
  const fields = useTaskFields(task)
  if (!task) return null
  const isEpic = !!task.isEpic
  const refetch = () => void detail.refetchTask()
  const modelChoice = (task as { modelChoice?: string | null }).modelChoice
  // A refusal known in advance: the field greyed, with why as its tooltip.
  const why = canChange ? undefined : VIEWER_CANNOT_WORK
  return (
    <>
      <Group name="Who">
        <TaskFact label="Agent">
          <AgentPicker currentAgentId={task.assignedAgentId ?? null} agents={detail.agents} disabled={!canChange} disabledReason={why} onAssign={id => change('The agent', () => detail.patch({ assignedAgentId: id || null }))} />
        </TaskFact>
        {/* The task's model shows once its read carries the choice. */}
        {!isEpic && modelChoice !== undefined && (
          <div title={why}><TaskModelField
            projectId={task.projectId} agentId={task.assignedAgentId} value={modelChoice ?? ''} disabled={!canChange}
            onChange={v => change('The model', () => detail.patch({ modelChoice: v || null }))}
          /></div>
        )}
      </Group>
      <Group name="Plan">
        <TaskFact label="Type">
          <NativeSelect
            size="sm" aria-label="Type" title={why} value={place.type?.id ?? ''} disabled={!canChange || !place.type}
            onChange={e => change('The type', () => place.setType(e.target.value))}
          >
            {!place.type && <option value="">…</option>}
            {place.typeChoices.map(c => <option key={c.id} value={c.id} disabled={!!c.disabledWhy} title={c.disabledWhy}>{c.label}</option>)}
          </NativeSelect>
        </TaskFact>
        <TaskFact label="Column">
          <NativeSelect
            size="sm" aria-label="Column" title={why} value={place.column?.id ?? ''} disabled={!canChange || !place.column}
            onChange={e => change('The column', () => place.setColumn(e.target.value))}
          >
            {!place.column && <option value="">…</option>}
            {place.columnChoices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </NativeSelect>
        </TaskFact>
        <TaskSprintFact task={task} canChange={canChange} change={change} onChanged={refetch} />
        {!isEpic && <TaskPlanFacts task={task as never} onChanged={refetch} part="link" />}
      </Group>
      <Group name="When">
        <TaskPlanFacts task={task as never} onChanged={refetch} part="due" />
        {isEpic && <TaskPlanFacts task={task as never} onChanged={refetch} part="link" />}
        {!isEpic && (
          <TaskFact label="Starts">
            <span className={task.scheduleAt ? '' : 'text-text-muted'}>{startsText(task.scheduleAt)}</span>
            {onRunAt && canChange && (
              <>
                {' · '}
                <button type="button" onClick={onRunAt} className="rounded text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {task.scheduleAt ? 'Change…' : 'Run at…'}
                </button>
              </>
            )}
          </TaskFact>
        )}
      </Group>
      {fields.fields.length > 0 && (
        <Group name="Fields">
          <TaskFieldFacts task={task} fields={fields.fields} values={fields.values} canChange={canChange} change={change} onChanged={() => void fields.refetch()} />
        </Group>
      )}
      <Group name="About">
        <TaskFact label="Priority">
          <NativeSelect
            size="sm" aria-label="Priority" title={why} value={task.priority} disabled={!canChange}
            onChange={e => change('The priority', () => detail.patch({ priority: e.target.value }))}
          >
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </NativeSelect>
        </TaskFact>
        <TaskOnBehalfOfSection taskId={task.id} onChanged={refetch} />
        {!isEpic && (
          <TaskFact label="Workspace">
            <TaskWorkspaceSelect
              projectId={task.projectId} taskId={task.id} disabled={!canChange} title={why}
              onChange={id => change('The workspace', () => detail.patch({ workspaceId: id }))}
            />
          </TaskFact>
        )}
        {!isEpic && (
          <TaskFact label="Files">
            <TaskAttachments
              taskId={task.id} disabledReason={why}
              selected={files?.opened?.kind === 'attachment' ? files.opened.id : undefined}
              onOpen={files ? id => files.onOpen({ kind: 'attachment', id }) : undefined}
            />
          </TaskFact>
        )}
        {!isEpic && files?.loc && (
          <TaskWorkingFiles
            loc={files.loc}
            selected={files.opened?.kind === 'working' ? files.opened.path : undefined}
            onOpen={path => files.onOpen({ kind: 'working', path })}
          />
        )}
      </Group>
    </>
  )
}
