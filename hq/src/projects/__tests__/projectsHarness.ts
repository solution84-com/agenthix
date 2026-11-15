import { prisma } from '../../test/db'
import { createUserWithRole, createAgent, createProject, createTestTask, taskTypeOf } from '../../test/factories'

// Shared by the projects integration tests. The vi.mock blocks stay in each test
// file: vitest hoists them per file.

/** A Wasp operation context whose entity delegates are the real test client. */
export function ctx(user: { id: string } | undefined | null) {
  return {
    user: user ?? undefined,
    entities: {
      Task: prisma.task,
      Agent: prisma.agent,
      Project: prisma.project,
      Board: prisma.board,
      AgentSession: prisma.agentSession,
      TaskAttachment: prisma.taskAttachment,
      TaskComment: prisma.taskComment,
      ProjectMember: prisma.projectMember,
      User: prisma.user,
      UserSettings: prisma.userSettings,
    },
  } as any
}

let taskSeq = 0
/** A task row, numbered uniquely; `onBehalfOfUserId` is a placeholder unless given. */
export function makeTask(projectId: string, data: Record<string, unknown> = {}) {
  taskSeq++
  return createTestTask({
    data: { title: `Task ${taskSeq}`, projectId, number: taskSeq, onBehalfOfUserId: 'person-1', ...data } as any,
  })
}

/** The project's Task type's column for a state, which a task with no type yet moves to (moveTaskToColumn). */
export async function columnOfState(projectId: string, state: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE'): Promise<string> {
  return (await prisma.typeColumn.findFirstOrThrow({ where: { typeId: await taskTypeOf(projectId), state } })).id
}

/** A saved board: a view of the project's tasks by state unless `data` says otherwise (adr-0176). */
export function makeBoard(projectId: string, data: Record<string, unknown> = {}) {
  return prisma.board.create({ data: { name: 'Board', projectId, view: 'STATE', ...data } as any })
}

export async function assignAgent(projectId: string, agentId: string) {
  await prisma.projectAgent.create({ data: { projectId, agentId } })
}

/**
 * A private project with one member, an org admin who is not a member, an agent
 * assigned to the project, a saved board, and a task in To do assigned to the
 * agent. Both people hold `role` in the organisation, so only membership tells
 * them apart.
 */
export async function privateProjectCast(role: 'ADMIN' | 'MEMBER' = 'ADMIN') {
  const member = await createUserWithRole(role)
  const outsider = await createUserWithRole(role)
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
  const agent = await createAgent()
  await assignAgent(project.id, agent.id)
  const board = await makeBoard(project.id)
  const task = await makeTask(project.id, { state: 'TODO', assignedAgentId: agent.id })
  return { member, outsider, project, agent, board, task }
}

/** Every row an operation on a project could write, in a stable order, to compare before and after. */
export async function projectState() {
  const [tasks, boards, comments, sessions, members, agents] = await Promise.all([
    prisma.task.findMany({ orderBy: { id: 'asc' } }),
    prisma.board.findMany({ orderBy: { id: 'asc' } }),
    prisma.taskComment.findMany({ orderBy: { id: 'asc' } }),
    prisma.agentSession.findMany({ orderBy: { id: 'asc' } }),
    prisma.projectMember.findMany({ orderBy: [{ projectId: 'asc' }, { userId: 'asc' }] }),
    prisma.projectAgent.findMany({ orderBy: [{ projectId: 'asc' }, { agentId: 'asc' }] }),
  ])
  return { tasks, boards, comments, sessions, members, agents }
}
