import { useEffect, useMemo, useState } from 'react'
import { useQuery, getAgentStartPlan } from 'wasp/client/operations'
import { Check, Play } from 'lucide-react'
import { Button, Modal } from '@agenthix/ui/primitives'
import { ColumnChip, RunAvatar } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { refusalText } from '../../shared/refusal'
import type { CantRunTask, StartPlan, StartPlanAgent, StartPlanTask } from '../agentStartPlan'
import { clockText } from './workroomWords'

const ROW = 'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left max-sm:min-h-11'
const KEY = 'shrink-0 font-mono text-micro text-text-muted'
const HEADING = 'mt-4 mb-1 text-micro font-medium uppercase tracking-wide text-text-muted'

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-on-accent' : 'border-border-strong bg-surface-1'}`}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  )
}

/** One task the Start would run: the whole row toggles its tick, so on a phone the target is the row. */
function PickRow({ task, rank, on, onToggle }: { task: StartPlanTask; rank?: number; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onToggle} className={`${ROW} hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? '' : 'opacity-60'}`}>
      <Tick on={on} />
      {rank !== undefined && <span className="w-4 shrink-0 text-micro tabular-nums text-text-muted">{rank}</span>}
      <span className={KEY}>{task.key}</span>
      <b className="min-w-0 flex-1 truncate font-medium text-text-primary">{task.title}</b>
      {task.typeName && <span className="shrink-0 text-micro text-text-secondary max-sm:hidden">{task.typeName}</span>}
      {task.columnName && <ColumnChip name={task.columnName} />}
    </button>
  )
}

function cantRunWhy(t: CantRunTask, agentName: string | null): string {
  switch (t.reason) {
    case 'epic': return 'an epic: never run'
    case 'noAgent': return 'no agent'
    case 'startTime': {
      const at = t.startsAt ? `starts at ${clockText(t.startsAt)} (Run at…)` : 'waits for its Run at… time'
      return agentName ? `${agentName} · ${at}` : at
    }
  }
}

function CantRun({ tasks, agentNames }: { tasks: CantRunTask[]; agentNames?: Map<string, string> }) {
  if (tasks.length === 0) return null
  return (
    <>
      <div className={HEADING}>Can’t run</div>
      {tasks.map(t => (
        <div key={t.id} className={`${ROW} opacity-70`}>
          <span className={KEY}>{t.key}</span>
          <b className="min-w-0 flex-1 truncate font-medium text-text-primary">{t.title}</b>
          <span className="shrink-0 text-small text-text-muted">{cantRunWhy(t, agentNames && t.agentId ? agentNames.get(t.agentId) ?? null : null)}</span>
        </div>
      ))}
    </>
  )
}

function useTicks(plan: StartPlan | undefined) {
  const all = useMemo(() => (plan?.agents ?? []).flatMap(a => a.ready.map(t => t.id)), [plan])
  const [off, setOff] = useState<Set<string>>(new Set())
  useEffect(() => { setOff(new Set()) }, [all.join('|')])
  const ticked = all.filter(id => !off.has(id))
  const toggle = (id: string) => setOff((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return { ticked, isOn: (id: string) => !off.has(id), toggle }
}

function Foot({ count, onCancel, onStart, busy }: { count: number; onCancel: () => void; onStart: () => void; busy: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button
        type="button" leadingIcon={<Play size={14} aria-hidden className="fill-current" />}
        disabled={count === 0 || busy} title={count === 0 ? 'Nothing ticked' : undefined} onClick={onStart}
      >
        Start {plural(count, 'task')}
      </Button>
    </div>
  )
}

function Loading({ error }: { error: unknown }) {
  return error
    ? <p role="alert" className="text-body text-text-secondary">{refusalText(error, 'What would run could not be read. Try again.')}</p>
    : <p className="text-small text-text-muted">Reading what is ready…</p>
}

/**
 * An agent's ▶ Start (the Workroom design, D17): the tasks that will run, in rank order, each with a tick; what can't
 * run and why. Start, with the count, is the dialog's one filled button; with every tick cleared it is greyed.
 */
export function StartAgentDialog({ projectId, agent, onCancel, onStart, busy }: {
  projectId: string
  agent: { agentId: string; name: string }
  onCancel: () => void
  onStart: (taskIds: string[]) => void
  busy: boolean
}) {
  const { data, error } = useQuery(getAgentStartPlan, { projectId, agentId: agent.agentId })
  const plan = data as StartPlan | undefined
  const { ticked, isOn, toggle } = useTicks(plan)
  const mine = plan?.agents.find(a => a.agentId === agent.agentId)
  const ready = mine?.ready ?? []
  return (
    <Modal open onClose={onCancel} title={`Start ${agent.name} on ${plural(ready.length, 'task')}?`} maxWidth="max-w-xl">
      {!plan ? <Loading error={error} /> : (
        <>
          <p className="text-body text-text-secondary">
            {ready.length === 0
              ? `No task is ready for ${agent.name}: none in a To do column, not yet run, with ${agent.name}.`
              : `${agent.name} takes them one at a time, in the project’s rank order. Untick one to leave it out.`}
          </p>
          <div className="mt-3">
            {ready.map((t, i) => <PickRow key={t.id} task={t} rank={i + 1} on={isOn(t.id)} onToggle={() => toggle(t.id)} />)}
          </div>
          <CantRun tasks={plan.cantRun} />
          <Foot count={ticked.length} onCancel={onCancel} busy={busy} onStart={() => onStart(ticked)} />
        </>
      )}
    </Modal>
  )
}

function agentLine(a: StartPlanAgent): string {
  const on = a.running.length > 0 ? `after ${a.running.map(t => t.title).join(' and ')}` : 'nothing at work'
  return a.ready.length > 0 ? on : `${on} · nothing ready`
}

/** Start all agents… (the Workroom design): one confirm, grouped by agent, with what each is on now. */
export function StartAllDialog({ projectId, projectName, onCancel, onStart, busy }: {
  projectId: string
  projectName: string
  onCancel: () => void
  onStart: (taskIds: string[]) => void
  busy: boolean
}) {
  const { data, error } = useQuery(getAgentStartPlan, { projectId })
  const plan = data as StartPlan | undefined
  const { ticked, isOn, toggle } = useTicks(plan)
  const names = new Map((plan?.agents ?? []).map(a => [a.agentId, a.name]))
  return (
    <Modal open onClose={onCancel} title={`Start every agent in ${projectName}?`} maxWidth="max-w-xl">
      {!plan ? <Loading error={error} /> : (
        <>
          <p className="text-body text-text-secondary">Each agent takes its own one at a time, in the project’s rank order, after the run it is on.</p>
          {plan.agents.map(a => (
            <div key={a.agentId}>
              <div className="mt-3 flex min-w-0 items-center gap-2">
                <RunAvatar name={a.name} state={a.running.length > 0 ? 'RUNNING' : null}>
                  <AuthedAgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                </RunAvatar>
                <b className="shrink-0 font-medium text-text-primary">{a.name}</b>
                <span className="min-w-0 truncate text-small text-text-secondary">· {agentLine(a)}</span>
              </div>
              <div className="pl-6">
                {a.ready.map(t => <PickRow key={t.id} task={t} on={isOn(t.id)} onToggle={() => toggle(t.id)} />)}
              </div>
            </div>
          ))}
          <CantRun tasks={plan.cantRun} agentNames={names} />
          <Foot count={ticked.length} onCancel={onCancel} busy={busy} onStart={() => onStart(ticked)} />
        </>
      )}
    </Modal>
  )
}
