import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAction, moveTask, updateTask, updateTaskPlan, archiveTask } from 'wasp/client/operations'
import { TasksPickDialog, type TaskListOption, type TaskListRowData } from '@agenthix/ui/tasks'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { bulkOutcome, NO_SPRINT_YET } from './taskSelectionWords'

export type SelectionAction = { label: string; onSelect: () => void; danger?: boolean; disabledWhy?: string }

type Picking = 'epic' | 'agent' | null

/**
 * The lines ticked on a project's Tasks (T4), and what can be done with them: Move to To do (each on its type's
 * default To do column), Add to sprint…, Set epic…, Assign agent…, Select all and Archive. Each is the one-task
 * action, once per task; nothing starts work (D6). A failure on some tasks is said in the attention dialog, naming
 * them; the ticks stay on what did not change.
 */
export function useTaskSelection({ projectId, rows, epics, enabled, onFailure }: {
  projectId: string
  /** The lines shown, for Select all and for naming a failure. */
  rows: TaskListRowData[]
  epics: TaskListOption[]
  /** False for someone who may not change tasks here: nothing can be ticked. */
  enabled: boolean
  onFailure: (text: string) => void
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [picking, setPicking] = useState<Picking>(null)
  const agents = useProjectAgents(projectId)
  const move = useAction(moveTask)
  const update = useAction(updateTask)
  const plan = useAction(updateTaskPlan)
  const archive = useAction(archiveTask)

  // A line that leaves the list (another card, a filter, archived) leaves the selection too.
  const shown = useMemo(() => new Set(rows.map(r => r.id)), [rows])
  useEffect(() => {
    setSelected(prev => {
      const kept = [...prev].filter(id => shown.has(id))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [shown])

  const toggle = (row: TaskListRowData) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(row.id)) next.delete(row.id)
    else next.add(row.id)
    return next
  })
  const clear = () => setSelected(new Set())

  async function each(what: string, run: (id: string) => Promise<unknown>) {
    const ids = [...selected]
    const results = await Promise.allSettled(ids.map(run))
    const failed = ids.filter((_, i) => results[i].status === 'rejected')
    const firstReason = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason
    setSelected(new Set(failed))
    const keys = failed.map(id => rows.find(r => r.id === id)?.key ?? 'a task')
    const text = bulkOutcome(what, keys, ids.length, firstReason instanceof Error ? firstReason.message : null)
    if (text) onFailure(text)
  }

  const count = selected.size
  const actions: SelectionAction[] = [
    { label: 'Move to To do', onSelect: () => void each('moved to To do', id => move({ taskId: id, state: 'TODO' })) },
    { label: 'Add to sprint…', onSelect: () => {}, disabledWhy: NO_SPRINT_YET },
    { label: 'Set epic…', onSelect: () => setPicking('epic') },
    { label: 'Assign agent…', onSelect: () => setPicking('agent') },
    { label: `Select all ${rows.length}`, onSelect: () => setSelected(new Set(rows.map(r => r.id))) },
    { label: `Archive ${count} task${count === 1 ? '' : 's'}`, danger: true, onSelect: () => void each('archived', id => archive({ taskId: id })) },
  ]

  const dialog: ReactNode = picking === 'epic' ? (
    <TasksPickDialog
      title={`Set the epic of ${count} task${count === 1 ? '' : 's'}`} label="Epic" none="No epic" submit="Set epic"
      choices={epics} onClose={() => setPicking(null)}
      onPick={epicId => { setPicking(null); void each(epicId ? 'put in the epic' : 'taken out of their epic', id => plan({ taskId: id, epicId })) }}
    />
  ) : picking === 'agent' ? (
    <TasksPickDialog
      title={`Assign an agent to ${count} task${count === 1 ? '' : 's'}`} label="Agent" none="No agent" submit="Assign"
      choices={agents.map(a => ({ id: a.id, name: a.name }))} onClose={() => setPicking(null)}
      onPick={agentId => { setPicking(null); void each(agentId ? 'assigned' : 'unassigned', id => update({ taskId: id, assignedAgentId: agentId })) }}
    />
  ) : null

  return {
    selected: enabled ? selected : new Set<string>(),
    toggle,
    /** A touch held on a line: selection starts with it ticked. */
    longPress: (row: TaskListRowData) => setSelected(prev => (prev.has(row.id) ? prev : new Set([...prev, row.id]))),
    clear,
    count: enabled ? count : 0,
    actions,
    dialog,
  }
}
