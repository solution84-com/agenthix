import type { TaskState } from '@agenthix/core'
import { useQuery, getTasks, getMilestones } from 'wasp/client/operations'
import { EpicProgressBlock, type EpicTaskRow } from './TaskEpic'
import { epicProgress, type EpicProgress } from './taskPageState'

type EpicTask = { id: string; projectId: string; milestoneId?: string | null; planFinish?: string | Date | null }

type ListedTask = { id: string; number: number; title: string; state: TaskState; epicId: string | null; isEpic: boolean }

export type EpicView = {
  tasks: EpicTaskRow[]
  progress: EpicProgress
  /** Its own due date, else its milestone's. */
  due: string | Date | null
  /** New task, with the epic filled in. */
  addHref: string
}

/** An epic's tasks and when it is due; with no epic, nothing is read. */
export function useEpicPage(epic: EpicTask | null, projectKey: string): EpicView {
  const { data: listed } = useQuery(getTasks, epic ? { projectId: epic.projectId } : undefined, { enabled: !!epic })
  const { data: milestones } = useQuery(getMilestones, epic ? { projectId: epic.projectId } : undefined, { enabled: !!epic?.milestoneId })
  const tasks: EpicTaskRow[] = epic ? ((listed ?? []) as unknown as ListedTask[])
    .filter(t => t.epicId === epic.id && !t.isEpic)
    .map(t => ({ id: t.id, key: `${projectKey}-${t.number}`, title: t.title, state: t.state })) : []
  const milestone = epic?.milestoneId ? (milestones ?? []).find(m => m.id === epic.milestoneId) ?? null : null
  return {
    tasks,
    progress: epicProgress(tasks),
    due: epic?.planFinish ?? milestone?.date ?? null,
    addHref: `/projects/${projectKey}/tasks/new${epic ? `?epic=${encodeURIComponent(epic.id)}` : ''}`,
  }
}

function Progress({ epic, now }: { epic: EpicView; now: Date }) {
  return <EpicProgressBlock progress={epic.progress} due={epic.due} now={now} />
}

export const EpicPage = { Progress }
