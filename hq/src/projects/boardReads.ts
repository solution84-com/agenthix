/**
 * The client protocol's board reads (`getProjectBoards`, `getBoards`, `getAllBoards`, `getBoard`), answered from
 * boards as saved views (adr-0176) for the mobile app. A project's boards are its built-in Task state board, named by
 * the project's own id, and its saved boards; `view` and `viewColumns` say what each board is. Access is the caller's
 * to check; these only read.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type {
  BoardAcrossProjects, BoardFields, BoardSummary, BoardView, BoardViewSpec, SprintView, TaskCard,
} from '@agenthix/core'
import { withDisplayReasons } from './taskReasonDisplay'
import { withRunWaitNotes } from '../automation/queueNotes'
import { withLatestResults } from '../server/controlplane/taskRunResults'
import { agentRef, TASK_KIND_INCLUDE, taskFields, taskProjectRef } from './taskWire'
import { daysLeft, sprintTitle } from './sprintSeries'
import { needsYou } from './needsYou'
import { RANK_ORDER } from './boardCardService'
import { listBoards, type BoardListEntry } from './boardListService'
import { readBoard } from './boardViewService'
import { readBoardViewsAcrossProjects } from './boardViewsAcrossProjects'

export function sprintView(s: { id: string; projectId: string; number: number; name: string | null; startDate: Date; finishDate: Date; finishedAt: Date | null }, now = new Date()): SprintView {
  return {
    id: s.id, projectId: s.projectId, number: s.number, name: s.name, label: sprintTitle(s), startDate: s.startDate, finishDate: s.finishDate,
    finishedAt: s.finishedAt, daysLeft: s.finishedAt ? 0 : daysLeft(s, now),
  }
}

/** A board has no sprints of its own: every board's `currentSprint` is its project's (adr-0176). */
async function projectCurrentSprint(projectId: string): Promise<SprintView | null> {
  const s = await prisma.sprint.findFirst({ where: { projectId, finishedAt: null }, orderBy: { number: 'asc' } })
  return s ? sprintView(s) : null
}

/** The boards a read lists: the Task state board, by the project's id, and the saved ones. */
function listed(projectId: string, entries: BoardListEntry[]): Array<BoardListEntry & { id: string }> {
  return entries
    .filter(e => e.id !== null || e.kind === 'STATE')
    .map(e => ({ ...e, id: e.id ?? projectId }))
}

const viewOf = (e: Pick<BoardListEntry, 'kind' | 'typeId' | 'fieldId' | 'filter'>): BoardViewSpec =>
  ({ kind: e.kind, typeId: e.typeId, fieldId: e.fieldId, filter: e.filter })

const workflowKind = (e: { builtIn: boolean }) => (e.builtIn ? 'PROJECT_TASKS' as const : 'WORKFLOW' as const)

function summaryOf(e: BoardListEntry & { id: string }, sprint: SprintView | null): BoardSummary {
  return {
    id: e.id, name: e.name, kind: workflowKind(e), archivedAt: null,
    view: viewOf(e), viewColumns: e.spread.map(c => ({ key: c.key, name: c.name, colour: c.colour, count: c.count })),
    needsYouCount: e.needsYouCount, currentSprint: sprint,
  }
}

export async function readProjectBoards(projectId: string): Promise<BoardSummary[]> {
  const [entries, sprint] = await Promise.all([listBoards(projectId), projectCurrentSprint(projectId)])
  return listed(projectId, entries).map(e => summaryOf(e, sprint))
}

export async function readBoardFields(projectId: string): Promise<BoardFields[]> {
  const [entries, rows, project] = await Promise.all([
    listBoards(projectId),
    prisma.board.findMany({ where: { projectId }, select: { id: true, createdAt: true, updatedAt: true } }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { createdAt: true } }),
  ])
  const dates = new Map(rows.map(r => [r.id, r]))
  return listed(projectId, entries).map(e => ({
    id: e.id, name: e.name, projectId, kind: workflowKind(e), view: viewOf(e),
    archivedAt: null,
    createdAt: dates.get(e.id)?.createdAt ?? project.createdAt, updatedAt: dates.get(e.id)?.updatedAt ?? project.createdAt,
  }))
}

export async function readAllBoards(userId: string): Promise<BoardAcrossProjects[]> {
  const perProject = await readBoardViewsAcrossProjects(userId)
  const sprints = await Promise.all(perProject.map(p => projectCurrentSprint(p.project.id)))
  return perProject.flatMap((p, i) => listed(p.project.id, p.boards).map(e => ({ ...summaryOf(e, sprints[i]), project: p.project })))
}

const CARD_INCLUDE = { assignedAgent: { select: { id: true, name: true, handle: true } }, ...TASK_KIND_INCLUDE } satisfies Prisma.TaskInclude

/** A task as a board shows it: the row, its agent, why its run waits, its key, and whether it needs a person. */
async function taskCards(where: Prisma.TaskWhereInput, projectKey: string): Promise<TaskCard[]> {
  const rows = await prisma.task.findMany({ where, include: CARD_INCLUDE, orderBy: RANK_ORDER })
  const shown = await withLatestResults(await withRunWaitNotes(await withDisplayReasons(rows)))
  return shown.map(t => ({
    ...taskFields(t), assignedAgent: agentRef(t.assignedAgent), runWait: t.runWait,
    taskKey: `${projectKey}-${t.number}`, needsYou: needsYou(t),
  }))
}

/** One board: a saved board by its id, or the project's Task state board by the project's id. */
export async function readBoardView(boardId: string, projectId: string): Promise<BoardView> {
  const builtIn = boardId === projectId
  const [read, project, sprint] = await Promise.all([
    readBoard(builtIn ? { projectId, kind: 'STATE' } : { boardId }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, key: true } }),
    projectCurrentSprint(projectId),
  ])
  const shownIds = read.columns.flatMap(c => c.cards.map(card => card.id))
  const { spec } = read.board
  return {
    id: boardId, name: read.board.name, kind: builtIn ? 'PROJECT_TASKS' : 'WORKFLOW', archivedAt: null,
    projectId, project: taskProjectRef(project),
    view: { kind: spec.kind, typeId: spec.typeId, fieldId: spec.fieldId, filter: spec.filter },
    viewColumns: read.columns.map(c => ({ key: c.key, name: c.name, colour: c.colour, count: c.count })),
    tasks: await taskCards({ id: { in: shownIds }, projectId }, project.key),
    currentSprint: sprint,
  }
}
