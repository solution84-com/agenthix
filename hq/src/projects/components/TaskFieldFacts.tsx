import { useAction, useQuery, getCustomFields, getTaskFieldValues, setTaskFieldValue } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import { TaskFact } from '@agenthix/ui/tasks'
import type { CustomFieldView, TaskFieldValue } from '@agenthix/core'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import type { TaskChange } from './TaskFactsPanel'
import { retryUnlessDenied } from '../place/retryUnlessDenied'

/** The project's fields and the task's values in them; no fields, nothing to draw. */
export function useTaskFields(task: { id: string; projectId: string } | null | undefined) {
  const { data: fields } = useQuery(getCustomFields, task ? { projectId: task.projectId } : undefined, { enabled: !!task })
  const { data: values, refetch } = useQuery(getTaskFieldValues, task ? { taskId: task.id } : undefined, { enabled: !!task, retry: retryUnlessDenied })
  return { fields: (fields ?? []) as CustomFieldView[], values: (values ?? []) as TaskFieldValue[], refetch }
}

/**
 * The project's custom fields in a task's Details (spec D4, the task design's key 5): one row per single-select field,
 * "—" for none. A value is a view only: it never touches the task's state.
 */
export function TaskFieldFacts({ task, fields, values, canChange, change, onChanged }: {
  task: { id: string }
  fields: CustomFieldView[]
  values: TaskFieldValue[]
  canChange: boolean
  change: TaskChange
  onChanged: () => void
}) {
  const set = useAction(setTaskFieldValue)
  const why = canChange ? undefined : VIEWER_CANNOT_WORK
  return (
    <>
      {fields.map(f => {
        const value = values.find(v => v.fieldId === f.id)?.optionId ?? ''
        return (
          <TaskFact key={f.id} label={f.name}>
            <NativeSelect
              size="sm" aria-label={f.name} title={why} value={value} disabled={!canChange}
              onChange={e => change(f.name, async () => { await set({ taskId: task.id, fieldId: f.id, optionId: e.target.value || null }); onChanged() })}
            >
              <option value="">—</option>
              {f.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </TaskFact>
        )
      })}
    </>
  )
}
