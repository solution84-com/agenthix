import type { ReactNode } from 'react'
import { TASK_STATE_LABELS, type CustomFieldView, type TaskTypeView } from '@agenthix/core'
import { NativeSelect, DateField } from '@agenthix/ui/primitives'
import { AgentPicker, TaskFact } from '@agenthix/ui/tasks'
import { startsIn } from '../components/taskPlace'
import { showsModel, showsRunFacts, type NewTaskValues } from './newTaskState'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-small font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

export interface NewTaskDetailsProps {
  values: NewTaskValues
  onChange: (patch: Partial<NewTaskValues>) => void
  types: TaskTypeView[]
  agents: { id: string; name: string }[]
  epics: { id: string; number: number; title: string }[]
  /** The sprints a task can be planned into: the current one and those planned ahead. */
  sprints: { id: string; name: string }[]
  /** The project's custom fields: the Fields group, as the task page's Details draws it. */
  fields: CustomFieldView[]
  /** The model picker for the chosen agent: the host's, which reads what the project allows. */
  renderModel: (state: { agentId: string; value: string; onChange: (v: string) => void }) => ReactNode
  /** Who it is for: the person making it. */
  personName: string | null
  /** The workspace its runs work in: the host's field, which reads the project's workspaces. Not on an epic. */
  renderWorkspace: () => ReactNode
}

/** "Reported (Backlog)": where the task starts, shown and not chosen (D11, N2). */
export function startsInText(types: readonly TaskTypeView[], v: NewTaskValues): string {
  const column = startsIn(types.find(t => t.id === v.typeId), v.columnId || null)
  if (!column) return '…'
  return column.name === TASK_STATE_LABELS[column.state] ? column.name : `${column.name} (${TASK_STATE_LABELS[column.state]})`
}

/**
 * The task page's Details for a task not yet made (TK1): Who, Plan, When, Fields, About. The column is shown, not
 * chosen: it starts in its type's Backlog column, or the column it was added from, at the bottom of the project's
 * order; a sprint chosen moves a Backlog task to To do once it is made (N1). An epic may have an agent, to manage it,
 * and has no model, sprint, epic, start time or workspace.
 */
export function NewTaskDetails({ values: v, onChange, types, agents, epics, sprints, fields, renderModel, personName, renderWorkspace }: NewTaskDetailsProps) {
  const runs = showsRunFacts(types, v)
  return (
    <div className="space-y-4">
      <Group title="Who">
        <TaskFact label="Agent">
          <AgentPicker currentAgentId={v.agentId || null} agents={agents} onAssign={id => onChange({ agentId: id ?? '' })} />
        </TaskFact>
        {showsModel(types, v) && renderModel({ agentId: v.agentId, value: v.modelChoice, onChange: modelChoice => onChange({ modelChoice }) })}
      </Group>

      <Group title="Plan">
        <TaskFact label="Column"><span data-testid="new-task-column">Starts in {startsInText(types, v)}</span></TaskFact>
        {runs && (
          <TaskFact label="Sprint">
            <NativeSelect size="sm" aria-label="Sprint" value={v.sprintId} onChange={e => onChange({ sprintId: e.target.value })}>
              <option value="">None</option>
              {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          </TaskFact>
        )}
        {runs && (
          <TaskFact label="Epic">
            <NativeSelect size="sm" aria-label="Epic" value={v.epicId} onChange={e => onChange({ epicId: e.target.value })}>
              <option value="">None</option>
              {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </NativeSelect>
          </TaskFact>
        )}
      </Group>

      <Group title="When">
        <TaskFact label="Due">
          <DateField aria-label="Due" emptyText="None" value={v.due} onChange={e => onChange({ due: e.target.value })} />
        </TaskFact>
        {runs && (
          <TaskFact label="Starts">
            <DateField aria-label="Starts" withTime emptyText="Not scheduled" value={v.startsAt} onChange={e => onChange({ startsAt: e.target.value })} />
          </TaskFact>
        )}
      </Group>

      {fields.length > 0 && (
        <Group title="Fields">
          {fields.map(f => (
            <TaskFact key={f.id} label={f.name}>
              <NativeSelect
                size="sm" aria-label={f.name} value={v.fields[f.id] ?? ''}
                onChange={e => onChange({ fields: { ...v.fields, [f.id]: e.target.value } })}
              >
                <option value="">—</option>
                {f.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </NativeSelect>
            </TaskFact>
          ))}
        </Group>
      )}

      <Group title="About">
        <TaskFact label="Priority">
          <NativeSelect size="sm" aria-label="Priority" value={v.priority} onChange={e => onChange({ priority: e.target.value })}>
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </NativeSelect>
        </TaskFact>
        {personName && <TaskFact label="For">{personName} (you)</TaskFact>}
        {runs && renderWorkspace()}
      </Group>
    </div>
  )
}
