/** Rows and calls shared by automation's integration tests; the test files install their own mocks. */
import { expect } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createTestTask } from '../../test/factories'

let n = 0

export const COLUMNS = [
  { name: 'todo', label: 'To do', status: 'TODO', color: 'grey', order: 0 },
  { name: 'ready', label: 'Ready', status: 'TODO', color: 'grey', order: 1 },
  { name: 'done', label: 'Done', status: 'DONE', color: 'grey', order: 2 },
]

/** A call context as Wasp builds it: the signed-in person, or nobody. Operations here read through `prisma`, not `entities`. */
export function ctx(user?: { id: string } | null): any {
  return { user: user ?? undefined, entities: {} }
}

/** Wasp types an operation's result as `T | Promise<T>`, so the call is wrapped before it is awaited. */
export const refusedWith = (result: unknown, statusCode: number) =>
  expect(Promise.resolve(result)).rejects.toMatchObject({ statusCode })

export async function addMember(projectId: string, userId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  await prisma.projectMember.create({ data: { projectId, userId, role } })
}

/** A private project: only the people added to it are members. */
export function privateProject(data: Record<string, unknown> = {}) {
  return createProject({ accessLevel: 'PRIVATE', ...data })
}

export async function boardOf(projectId: string, columns: unknown[] = COLUMNS) {
  return prisma.board.create({ data: { name: `Board ${n++}`, projectId, columns } as any })
}

export async function taskIn(projectId: string, data: Record<string, unknown> = {}) {
  const { _max } = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  return createTestTask({
    data: { title: 'A task', projectId, number: (_max.number ?? 0) + 1, onBehalfOfUserId: 'nobody', ...data } as any,
  })
}

export const DAILY = { kind: 'interval', every: 1, unit: 'days' } as const

export async function routineIn(projectId: string, onBehalfOfUserId: string, data: Record<string, unknown> = {}) {
  return prisma.routine.create({
    data: {
      projectId, title: 'Board review', scheduleAt: new Date('2026-10-01T09:00:00Z'), scheduleRule: DAILY,
      scheduleTimezone: 'UTC', enabled: true, nextRoundAt: new Date('2026-10-06T09:00:00Z'), onBehalfOfUserId,
      ...data,
    } as any,
  })
}

/** Puts an agent on a project's roster, as a routine's agent must be. */
export const assignAgent = (projectId: string, agentId: string) =>
  prisma.projectAgent.create({ data: { projectId, agentId } as any })

/** An open project and the people a test casts in it: its routine's person, an admin and a plain member (none added to it yet). */
export async function createProjectWithUsers() {
  const project = await createProject()
  const [person, admin, member] = await Promise.all([createUser(), createUser(), createUser()])
  return { project, users: { person, admin, member } }
}
