/** Rows and calls shared by automation's integration tests; the test files install their own mocks. */
import { expect } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createTestTask } from '../../test/factories'

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

export async function taskIn(projectId: string, data: Record<string, unknown> = {}) {
  const { _max } = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  return createTestTask({
    data: { title: 'A task', projectId, number: (_max.number ?? 0) + 1, onBehalfOfUserId: 'nobody', ...data } as any,
  })
}

/** A routine every day at 09:00 UTC, on, due next on 6 October 2026. */
export async function routineIn(projectId: string, onBehalfOfUserId: string, data: Record<string, unknown> = {}) {
  return prisma.routine.create({
    data: {
      projectId, title: 'Board review', cron: '0 9 * * *', timezone: 'UTC', instructions: 'Review the board',
      enabled: true, nextDueAt: new Date('2026-10-06T09:00:00Z'), onBehalfOfUserId, ...data,
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
