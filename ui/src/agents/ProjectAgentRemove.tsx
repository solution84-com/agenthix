import { useState } from 'react'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import { NativeSelect } from '../primitives/NativeSelect'
import { useAttentionWhen } from '../attention/useAttentionWhen'

const OPTION = 'flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-small has-[:checked]:border-text-primary has-[:checked]:inset-ring has-[:checked]:inset-ring-text-primary'

type Pick = { choice: 'agent' | 'none' | null; target: string }

/** The chosen agent's id, null for none, or undefined while nothing is chosen. */
const picked = (p: Pick): string | null | undefined =>
  p.choice === 'none' ? null : p.choice === 'agent' && p.target !== '' ? p.target : undefined

/** One required choice: another agent here, picked from a list, or none. Nothing is chosen to start with. */
function AgentOrNone({ name, legend, agentLabel, selectLabel, noneLabel, noneHint, agents, value, onChange }: {
  name: string
  legend: string
  agentLabel: string
  selectLabel: string
  noneLabel: string
  noneHint?: string
  agents: { id: string; name: string }[]
  value: Pick
  onChange: (next: Pick) => void
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-micro font-medium uppercase tracking-wide text-text-muted">{legend}</legend>
      <label className={`${OPTION} ${agents.length === 0 ? 'opacity-40' : ''}`}>
        <input type="radio" className="accent-accent" name={name} disabled={agents.length === 0} checked={value.choice === 'agent'} onChange={() => onChange({ ...value, choice: 'agent' })} />
        <span className="flex-1">
          <b className="block font-medium text-text-primary">{agentLabel}</b>
          <NativeSelect
            size="sm" className="mt-1"
            aria-label={selectLabel} value={value.target} disabled={value.choice !== 'agent'} onChange={e => onChange({ ...value, target: e.target.value })}
          >
            <option value="">{selectLabel}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </span>
      </label>
      <label className={OPTION}>
        <input type="radio" className="accent-accent" name={name} checked={value.choice === 'none'} onChange={() => onChange({ ...value, choice: 'none' })} />
        <span>
          <b className="block font-medium text-text-primary">{noneLabel}</b>
          {noneHint && <span className="text-text-muted">{noneHint}</span>}
        </span>
      </label>
    </fieldset>
  )
}

/**
 * Remove from this project, in place: asks what happens to the agent's open tasks and routines here and, when it
 * is the project's default agent, which agent becomes the default. Nothing is chosen for the person, and Remove
 * stays disabled until every question is answered.
 */
export function ProjectAgentRemove({ agentName, isDefault = false, openTasks, doneTasks, otherAgents, onRemove, onCancel }: {
  agentName: string
  /** It is the project's default agent, so a new default must be chosen. */
  isDefault?: boolean
  openTasks: number
  doneTasks: number
  otherAgents: { id: string; name: string }[]
  /**
   * `openTasksTo`: another agent's id, or null to leave them unassigned. `newDefaultAgentId` is passed only when
   * it is the default: another agent's id, or null for no default.
   */
  onRemove: (openTasksTo: string | null, newDefaultAgentId?: string | null) => Promise<void>
  onCancel: () => void
}) {
  const [tasks, setTasks] = useState<Pick>({ choice: null, target: '' })
  const [nextDefault, setNextDefault] = useState<Pick>({ choice: null, target: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const openTasksTo = picked(tasks)
  const newDefault = picked(nextDefault)
  const ready = openTasksTo !== undefined && (!isDefault || newDefault !== undefined)

  const remove = async () => {
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      if (isDefault) await onRemove(openTasksTo, newDefault)
      else await onRemove(openTasksTo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <ViewHeaderRow><PanelHeaderContent back={agentName} onBack={onCancel} title={`Remove ${agentName} from this project`} /></ViewHeaderRow>
      <p className="pt-4 text-small text-text-primary">
        <b>{openTasks} open {openTasks === 1 ? 'task' : 'tasks'}</b> here {openTasks === 1 ? 'is' : 'are'} assigned to it · {doneTasks} done stay as {doneTasks === 1 ? 'it is' : 'they are'}
      </p>
      <AgentOrNone
        name="remove-choice" legend="Its open tasks and routines" agentLabel="Give them to" selectLabel="Another agent here"
        noneLabel="Leave them unassigned" noneHint="They wait until someone assigns them"
        agents={otherAgents} value={tasks} onChange={setTasks}
      />
      {isDefault && (
        <AgentOrNone
          name="default-choice" legend="The project's default agent becomes" agentLabel="Make another agent the default"
          selectLabel="The new default agent" noneLabel="No default agent"
          agents={otherAgents} value={nextDefault} onChange={setNextDefault}
        />
      )}
      {errorDialog}
      <div className="flex gap-2">
        <button type="button" className={TASK_BUTTON_PRIMARY} disabled={!ready || busy} onClick={() => void remove()}>Remove</button>
        <button type="button" className={TASK_BUTTON} onClick={onCancel}>Cancel</button>
      </div>
      <p className="text-micro text-text-muted">Nothing is chosen for you. Its conversations here stay readable. A run in progress finishes first.</p>
    </div>
  )
}
