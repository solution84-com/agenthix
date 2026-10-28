/**
 * Board operations — control-plane service layer (hq/site split spec §7.2,
 * plan 5b-2 task 3). See taskOps.ts's header for the shared conventions.
 *
 * Boards are lasting workflows (adr-0097): Project Tasks on every project, and
 * workflow and sprint boards. An agent lists, reads and makes them, and on a
 * sprint board renames and finishes sprints — saying, every time, where the
 * unfinished tasks go.
 */
import { prisma, HttpError } from 'wasp/server'
import { ControlPlaneError, type CallerContext, type ControlPlaneErrorCode } from './types'
import { requireProjectEntitlement } from './authorize'
import { projectsVisibleToRun } from './runProjectScope'
import { confinedProjectId, reachesOwnSpace } from './runPerson'
import { listBoards, getBoard, createBoard, parseColumns, sortedColumns, type ColumnInput } from '../../projects/projectService'
import { currentSprint, finishSprint, renameSprint, requireDestination } from '../../projects/sprintService'
import { sprintView } from '../../projects/boardView'
import { boardTemplateColumns } from '../../library/boardTemplateService'

/** A service's refusal, as the control plane says it: its own message, never a stack or a path. */
export async function asControlPlane<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof HttpError) {
      const code: ControlPlaneErrorCode = err.statusCode === 404 ? 'not_found' : err.statusCode === 409 ? 'conflict' : err.statusCode === 403 ? 'forbidden' : 'invalid'
      if (err.statusCode < 500) throw new ControlPlaneError(code, err.message)
    }
    throw err
  }
}

function columnsOut(raw: unknown) {
  return sortedColumns(parseColumns(raw)).map(c => ({
    name: c.name, label: c.label, status: c.status, autoQueue: c.autoQueue ?? false,
    ...(c.description ? { description: c.description } : {}),
  }))
}

// ── list_boards ───────────────────────────────────────────────────────────────

export async function listBoardsOp(ctx: CallerContext, args: { projectId?: string; includeArchived?: boolean }) {
  let effectiveProjectId = args.projectId
  // A run confined to a project lists that project alone: an explicit foreign
  // projectId is refused outright, and an omitted one is narrowed to the run's
  // project rather than listing across the org (§H2).
  if (ctx.kind !== 'connection' && !reachesOwnSpace(ctx)) {
    const confined = confinedProjectId(ctx)
    if ((args.projectId && args.projectId !== confined) || !confined) {
      throw new ControlPlaneError('forbidden', `list_boards is outside this ${ctx.kind}'s project scope`)
    }
    effectiveProjectId = confined
  }
  // Never the org's listing: the browser equivalent (`getAllBoards`) shows only
  // the projects the person is entitled to (ADR-0062), so this one is narrowed
  // to the run's person the same way (adr-0101) — and a connection's, further,
  // to its own project list (adr-0090).
  const boards = await listBoards(effectiveProjectId, await projectsVisibleToRun(ctx, 'list_boards'), !!args.includeArchived)
  return {
    boards: boards.map(b => ({
      boardId: b.id, name: b.name, projectId: b.projectId, kind: b.kind, archived: b.archivedAt !== null,
      columns: columnsOut(b.columns),
    })),
    source: 'local',
  }
}

// ── get_board ─────────────────────────────────────────────────────────────────

export async function getBoardOp(ctx: CallerContext, args: { boardId: string }) {
  const board = await getBoard(args.boardId)
  if (!board) throw new ControlPlaneError('not_found', `Board ${args.boardId} not found`)
  await requireProjectEntitlement(ctx, board.projectId, 'get_board', 'read')
  const sprint = board.kind === 'SPRINTS' ? await currentSprint(board.id) : null
  return {
    boardId: board.id, name: board.name, projectId: board.projectId, kind: board.kind,
    archived: board.archivedAt !== null, columns: columnsOut(board.columns),
    currentSprint: sprint ? sprintOut(sprintView(sprint)) : null,
    source: 'local',
  }
}

function sprintOut(s: ReturnType<typeof sprintView>) {
  return {
    sprintId: s.id, number: s.number, name: s.name, label: s.label,
    startDate: s.startDate.toISOString().slice(0, 10), finishDate: s.finishDate.toISOString().slice(0, 10),
    finished: s.finishedAt !== null, daysLeft: s.daysLeft,
  }
}

// ── create_board ──────────────────────────────────────────────────────────────

interface CreateBoardArgs {
  projectId: string
  name: string
  description?: string
  templateId?: string
  kind?: 'workflow' | 'sprints'
  sprintDays?: number
  columns?: Array<{ name: string; label: string; status: 'todo' | 'in_progress' | 'done' }>
}

// No blanket try/catch-and-wrap here (plan 5b-2 task 5 review, I3): only the
// service's own refusals (HttpError 4xx) are translated; anything else (Prisma,
// the template's content read) propagates uncaught rather than
// forwarding err.message (which can carry Prisma's file paths and code
// excerpts) into a 400 body — dataApi.ts's generic catch turns it into an
// opaque 500 instead.
// The browser's rule (projects/actions.ts): someone who works in the project (adr-0101, adr-0102).
export async function createBoardOp(ctx: CallerContext, args: CreateBoardArgs) {
  await requireProjectEntitlement(ctx, args.projectId, 'create_board', 'work')

  const project = await prisma.project.findUnique({ where: { id: args.projectId } })
  if (!project) throw new ControlPlaneError('not_found', `Project ${args.projectId} not found`)

  const template = !args.columns?.length ? await boardTemplateColumns(args.templateId) : null
  const resolvedColumns: ColumnInput[] | undefined = template?.columns ?? args.columns
  const board = await asControlPlane(() => createBoard({
    projectId: args.projectId, name: args.name, madeFromVersionId: template?.madeFromVersionId, columns: resolvedColumns,
    kind: args.kind === 'sprints' ? 'SPRINTS' : 'WORKFLOW', sprintDays: args.sprintDays,
  }))
  return { success: true, boardId: board.id, kind: board.kind, message: `Board '${board.name}' created`, source: 'local' }
}

// ── finish_sprint / rename_sprint ─────────────────────────────────────────────

export async function finishSprintOp(ctx: CallerContext, args: { boardId: string; unfinished: string }) {
  const unfinished = await asControlPlane(async () => requireDestination(args.unfinished))
  const board = await prisma.board.findUnique({ where: { id: args.boardId }, select: { projectId: true } })
  if (!board) throw new ControlPlaneError('not_found', `Board ${args.boardId} not found`)
  await requireProjectEntitlement(ctx, board.projectId, 'finish_sprint', 'work')
  const result = await asControlPlane(() => finishSprint(args.boardId, unfinished))
  return {
    success: true,
    finished: sprintOut(sprintView(result.finished)),
    next: sprintOut(sprintView(result.next)),
    unfinished,
    movedTaskIds: result.movedTaskIds,
    source: 'local',
  }
}

export async function renameSprintOp(ctx: CallerContext, args: { sprintId: string; name: string | null }) {
  const sprint = await prisma.sprint.findUnique({ where: { id: args.sprintId }, select: { board: { select: { projectId: true } } } })
  if (!sprint) throw new ControlPlaneError('not_found', `Sprint ${args.sprintId} not found`)
  await requireProjectEntitlement(ctx, sprint.board.projectId, 'rename_sprint', 'work')
  const renamed = await asControlPlane(() => renameSprint(args.sprintId, args.name))
  return { success: true, sprint: sprintOut(sprintView(renamed)), source: 'local' }
}
