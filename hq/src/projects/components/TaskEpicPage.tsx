import { useQuery, getTasks, getMilestones } from 'wasp/client/operations'
import { EpicProgressBlock, type EpicTaskRow } from './TaskEpic'
import { epicProgress, type EpicProgress } from './taskPageState'

type EpicTask = { id: string; projectId: string; milestoneId?: string | null }

type ListedTask = {
  id: string; number: number; title: string; status: string; priority: string; runState: string; runStateReason: string | null
  epicId: string | null; isEpic: boolean; column: string | null; assignedAgent: { name: string } | null
  board: { columns: { name: string; label: string }[] }
}

export type EpicView = {
  tasks: EpicTaskRow[]
  progress: EpicProgress
  milestone: { name: string; date: string | Date } | null
  /** New task, with the epic filled in. */
  addHref: string
}

/** An epic's tasks and milestone; with no epic, nothing is read. */
export function useEpicPage(epic: EpicTask | null, projectKey: string): EpicView {
  const { data: listed } = useQuery(getTasks, epic ? { projectId: epic.projectId } : undefined, { enabled: !!epic })
  const { data: milestones } = useQuery(getMilestones, epic ? { projectId: epic.projectId } : undefined, { enabled: !!epic?.milestoneId })
  const now = new Date()
  const tasks: EpicTaskRow[] = epic ? ((listed ?? []) as unknown as ListedTask[])
    .filter(t => t.epicId === epic.id && !t.isEpic)
    .map(t => ({
      id: t.id, key: `${projectKey}-${t.number}`, title: t.title, status: t.status, priority: t.priority,
      runState: t.runState, runStateReason: t.runStateReason, agentName: t.assignedAgent?.name ?? null,
      columnLabel: t.board.columns.find(c => c.name === t.column)?.label ?? 'Backlog',
    })) : []
  const milestone = epic?.milestoneId ? (milestones ?? []).find(m => m.id === epic.milestoneId) ?? null : null
  return {
    tasks,
    progress: epicProgress(tasks, now),
    milestone: milestone ? { name: milestone.name, date: milestone.date } : null,
    addHref: `/projects/${projectKey}/tasks/new${epic ? `?epic=${encodeURIComponent(epic.id)}` : ''}`,
  }
}

function Progress({ epic, now }: { epic: EpicView; now: Date }) {
  return <EpicProgressBlock progress={epic.progress} milestone={epic.milestone} now={now} />
}

export const EpicPage = { Progress }
