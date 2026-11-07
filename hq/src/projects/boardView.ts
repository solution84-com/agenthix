/**
 * What the Boards tool reads (every screen reviewed spec §3, adr-0097): a
 * project's boards with their column counts, and one board with its columns,
 * its Backlog and the other boards' backlogs a person chose to show beside it.
 * Access is the caller's to check; these only read.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { BoardSummary, BoardView, SprintView, TaskCard } from '@agenthix/core'
import { withDisplayReasons } from './taskReasonDisplay'
import { withRunWaitNotes } from '../automation/queueNotes'
import { withLatestResults } from '../server/controlplane/taskRunResults'
import { projectRoundLine } from '../automation/automationStatus'
import { sortedColumns, wireColumns } from './boardColumns'
import { agentRef, taskFields, taskProjectRef } from './taskWire'
import { ensureProjectTasks, projectTasksFirst } from './boardService'
import { currentSprint } from './sprintService'
import { sprintDaysLeft, sprintLabel } from './sprintDates'
import { needsYou, NEEDS_YOU_SELECT } from './needsYou'

/** Declared in core's client protocol, since the mobile app reads boards too. */
export type { BoardSummary, BoardView, SprintView, TaskCard } from '@agenthix/core'

export function sprintView(s: { id: string; number: number; name: string | null; startDate: Date; finishDate: Date; finishedAt: Date | null }, now = new Date()): SprintView {
  return {
    id: s.id, number: s.number, name: s.name, label: sprintLabel(s), startDate: s.startDate, finishDate: s.finishDate,
    finishedAt: s.finishedAt, daysLeft: s.finishedAt ? 0 : sprintDaysLeft(s, now),
  }
}

/** A project's boards for the list: Project Tasks first, each column's count, its current sprint and how many tasks need a person. */
export async function readProjectBoards(projectId: string, includeArchived: boolean): Promise<BoardSummary[]> {
  const boards = projectTasksFirst(await prisma.board.findMany({
    where: { projectId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: 'asc' },
    include: { sprints: { where: { finishedAt: null }, orderBy: { number: 'desc' }, take: 1 } },
  }))
  const tasks = await prisma.task.findMany({
    where: { boardId: { in: boards.map(b => b.id) }, archived: false },
    select: { boardId: true, column: true, sprintId: true, ...NEEDS_YOU_SELECT },
  })
  return boards.map(b => {
    const sprint = b.sprints[0] ?? null
    const mine = tasks.filter(t => t.boardId === b.id)
    // A sprint board's columns show its current sprint; its past sprints' work is in their record.
    const inColumns = mine.filter(t => t.column !== null && (b.kind !== 'SPRINTS' || t.sprintId === sprint?.id))
    return {
      id: b.id, name: b.name, kind: b.kind, archivedAt: b.archivedAt, templateId: b.madeFromVersionId,
      columns: sortedColumns(wireColumns(b.columns)).map(c => ({ ...c, count: inColumns.filter(t => t.column === c.name).length })),
      backlogCount: mine.filter(t => t.column === null).length,
      needsYouCount: [...inColumns, ...mine.filter(t => t.column === null)].filter(needsYou).length,
      currentSprint: sprint ? sprintView(sprint) : null,
    }
  })
}

const CARD_INCLUDE = { assignedAgent: { select: { id: true, name: true, handle: true } } } satisfies Prisma.TaskInclude

/** A task as a board shows it: the row, its agent, why its run waits, its key, and whether it needs a person. */
export async function taskCards(where: Prisma.TaskWhereInput, projectKey: string): Promise<TaskCard[]> {
  const rows = await prisma.task.findMany({ where, include: CARD_INCLUDE, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] })
  const shown = await withLatestResults(await withRunWaitNotes(await withDisplayReasons(rows)))
  return shown.map(t => ({
    ...taskFields(t), assignedAgent: agentRef(t.assignedAgent), runWait: t.runWait,
    taskKey: `${projectKey}-${t.number}`, needsYou: needsYou(t),
  }))
}

export async function readBoardView(boardId: string, userId: string, opts: { includeArchivedTasks: boolean }): Promise<BoardView> {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: { project: { select: { id: true, name: true, key: true } } },
  })
  const archived = opts.includeArchivedTasks ? {} : { archived: false }
  const sprint = board.kind === 'SPRINTS' ? await currentSprint(boardId) : null
  // `projectId` beside `boardId`: the defence runBoard's dispatch query carries
  // against a task whose boardId points here but whose own projectId doesn't.
  const scope = { boardId, projectId: board.projectId, ...archived }
  const [tasks, backlog, showAlso, projectTasksBoardId] = await Promise.all([
    taskCards({ ...scope, column: { not: null }, ...(board.kind === 'SPRINTS' ? { sprintId: sprint?.id ?? '' } : {}) }, board.project.key),
    taskCards({ ...scope, column: null }, board.project.key),
    readShowAlsoBacklogs(boardId, board.projectId, board.project.key, userId),
    ensureProjectTasks(board.projectId),
  ])
  return {
    id: board.id, name: board.name, kind: board.kind, archivedAt: board.archivedAt, templateId: board.madeFromVersionId,
    projectId: board.projectId, project: taskProjectRef(board.project), projectTasksBoardId,
    columns: sortedColumns(wireColumns(board.columns)),
    tasks, backlog, showAlso,
    currentSprint: sprint ? sprintView(sprint) : null,
    roundLine: await projectRoundLine(board.projectId),
  }
}

/** The boards a person chose to show beside this one: only the project's other boards that still exist and are not archived. */
export async function showAlsoChoice(boardId: string, projectId: string, userId: string): Promise<Array<{ id: string; name: string }>> {
  const choice = await prisma.boardShowAlso.findUnique({ where: { userId_boardId: { userId, boardId } }, select: { boardIds: true } })
  if (!choice || choice.boardIds.length === 0) return []
  const boards = await prisma.board.findMany({
    where: { id: { in: choice.boardIds.filter(id => id !== boardId) }, projectId, archivedAt: null },
    select: { id: true, name: true, kind: true },
    orderBy: { createdAt: 'asc' },
  })
  return projectTasksFirst(boards)
}

async function readShowAlsoBacklogs(boardId: string, projectId: string, projectKey: string, userId: string) {
  const boards = await showAlsoChoice(boardId, projectId, userId)
  return Promise.all(boards.map(async b => ({
    boardId: b.id,
    boardName: b.name,
    tasks: await taskCards({ boardId: b.id, projectId, column: null, archived: false }, projectKey),
  })))
}
