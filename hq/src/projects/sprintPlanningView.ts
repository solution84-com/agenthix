/**
 * What Plan Sprint reads beside the sprint (spec N1, the Sprints design's planning screen): the project's Backlog and
 * To do tasks that are in no sprint, of every type, in rank order, as cards; and the project's epics, for the Epic
 * filter and Group by epic. An epic is never planned into a sprint, so none is in the list. Access is the caller's to
 * check; this only reads.
 */
import { prisma } from 'wasp/server'
import { boardCard, readCards, type BoardCard } from './boardCardService'

export type PlanningEpic = { id: string; key: string; title: string }

export type SprintPlanning = {
  /** Backlog and To do, in no sprint, not archived, no epics: what can be planned in. */
  tasks: BoardCard[]
  epics: PlanningEpic[]
}

export async function readSprintPlanning(projectId: string): Promise<SprintPlanning> {
  const [rows, epics] = await Promise.all([
    readCards({
      projectId, sprintId: null, state: { in: ['BACKLOG', 'TODO'] },
      NOT: { type: { kind: 'EPIC' } },
    }),
    prisma.task.findMany({
      where: { projectId, archived: false, type: { kind: 'EPIC' } },
      select: { id: true, number: true, title: true, project: { select: { key: true } } },
      orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }],
    }),
  ])
  return {
    tasks: rows.map(boardCard),
    epics: epics.map(e => ({ id: e.id, key: `${e.project.key}-${e.number}`, title: e.title })),
  }
}
