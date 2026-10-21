import { useState } from 'react'
import {
  DEFAULT_ROUTINE_SCHEDULE, FIELD_INPUT, RoutineRuleFields, scheduleInputOf, toLocalInput,
  type RoutineScheduleValue, type ScheduleRuleInput,
} from './RoutineRuleFields'

/**
 * Setting up or editing a routine (spec §3): the template each round is made
 * from — title, description, priority, labels, an optional agent, and where it
 * starts (a board and column, or the backlog) — and when rounds come.
 */

export interface RoutineFormBoard {
  id: string
  name: string
  stages: Array<{ name: string; label: string }>
}

export interface RoutineFormValue {
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  labels: string[]
  assignedAgentId: string | null
  boardId: string | null
  stage: string | null
  rule: ScheduleRuleInput
  /** ISO time the schedule is anchored at; null for now. */
  at: string | null
}

export interface RoutineFormSubmit {
  template: {
    title: string; description: string | null; priority: string; labels: string[]
    assignedAgentId: string | null; boardId: string | null; stage: string | null
  }
  /** Absent when the schedule was left as it was. */
  schedule?: { rule: ScheduleRuleInput; at: string | null; timezone: string }
}

export interface RoutineFormProps {
  initial?: RoutineFormValue
  boards: RoutineFormBoard[]
  agents: Array<{ id: string; name: string }>
  submitLabel: string
  onSubmit: (value: RoutineFormSubmit) => Promise<void>
  onCancel: () => void
  /** Editing: what saving does to the round already waiting, e.g. its key. */
  waitingKey?: string | null
}

/** Whether a round starts at its time or waits for a person, in words (adr-0104). */
export function routineStartWords(agentName: string | null): string {
  return agentName
    ? `At each round's time, ${agentName} starts it, whatever column it is in.`
    : 'With no agent, each round waits for a person to start it.'
}

export function RoutineForm({ initial, boards, agents, submitLabel, onSubmit, onCancel, waitingKey }: RoutineFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [priority, setPriority] = useState<RoutineFormValue['priority']>(initial?.priority ?? 'MEDIUM')
  const [labels, setLabels] = useState((initial?.labels ?? []).join(', '))
  const [agentId, setAgentId] = useState(initial?.assignedAgentId ?? '')
  const [boardId, setBoardId] = useState(initial?.boardId ?? '')
  const [stage, setStage] = useState(initial?.stage ?? '')
  const [schedule, setSchedule] = useState<RoutineScheduleValue>(
    initial ? { rule: initial.rule, at: toLocalInput(initial.at) } : DEFAULT_ROUTINE_SCHEDULE,
  )
  const [scheduleTouched, setScheduleTouched] = useState(!initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const board = boards.find(b => b.id === boardId)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onSubmit({
        template: {
          title, description: description.trim() || null, priority,
          labels: labels.split(',').map(l => l.trim()).filter(Boolean),
          assignedAgentId: agentId || null, boardId: boardId || null, stage: boardId ? stage || null : null,
        },
        ...(scheduleTouched ? { schedule: scheduleInputOf(schedule) } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the routine')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 text-small text-text-secondary">
      <label className="block space-y-1">
        <span>Title of each round</span>
        <input value={title} onChange={e => setTitle(e.target.value)} className={`${FIELD_INPUT} w-full`} />
      </label>
      <label className="block space-y-1">
        <span>Description</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${FIELD_INPUT} w-full`} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="block">Priority</span>
          <select value={priority} onChange={e => setPriority(e.target.value as RoutineFormValue['priority'])} className={FIELD_INPUT}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block">Agent</span>
          <select value={agentId} onChange={e => setAgentId(e.target.value)} className={FIELD_INPUT}>
            <option value="">None</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 flex-1 min-w-40">
          <span className="block">Labels, comma-separated</span>
          <input value={labels} onChange={e => setLabels(e.target.value)} className={`${FIELD_INPUT} w-full`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="block">Starts on</span>
          <select value={boardId} onChange={e => { setBoardId(e.target.value); setStage('') }} className={FIELD_INPUT}>
            <option value="">The backlog</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {board && (
          <label className="space-y-1">
            <span className="block">Column</span>
            <select value={stage} onChange={e => setStage(e.target.value)} className={FIELD_INPUT}>
              <option value="">First column</option>
              {board.stages.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-micro text-text-muted">{routineStartWords(agents.find(a => a.id === agentId)?.name ?? null)}</p>
      <div className="space-y-1">
        <span className="block">When rounds come</span>
        <RoutineRuleFields value={schedule} onChange={v => { setSchedule(v); setScheduleTouched(true) }} />
      </div>
      {waitingKey && (
        <p className="text-micro text-text-muted">Saving moves the waiting round ({waitingKey}) to match; past rounds stay as they are.</p>
      )}
      {error && <div className="text-danger">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button" disabled={busy || !title.trim()} onClick={() => void submit()}
          className="px-3 py-1 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-medium disabled:opacity-40"
        >
          {submitLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="px-3 py-1 text-text-muted hover:text-text-primary">
          Cancel
        </button>
      </div>
    </div>
  )
}
