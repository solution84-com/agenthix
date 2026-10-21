/**
 * Shared set-up for the control-plane integration tests: one small
 * organisation in the real test database and the callers that act in it.
 *
 * A private project with one member (its Member) and one outsider; a board and
 * a queued task in it, assigned to agent-1 and done on the member's behalf; the
 * member's own chat session, s1. Callers are a chat run in its person's own
 * storage, a run of the world's task confined to its project, and a person's
 * own connection (adr-0090). Every run is checked against the person it is for
 * (adr-0101), read from the database: a chat's own person, or the task's.
 */
import { expect } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUserWithRole, createProject, createTestTask } from '../../../test/factories'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import type { CallerContext, ConnectionGrant } from '../types'
import { ControlPlaneError } from '../types'

export type World = {
  member: { id: string }
  outsider: { id: string }
  project: { id: string }
  board: { id: string }
  task: { id: string }
  agentId: string
}

/** The world the last `seedWorld` made, so a task run defaults to its task. */
let seeded: World | null = null

export async function seedWorld(): Promise<World> {
  const member = await createUserWithRole('MEMBER')
  const outsider = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
  const agent = await prisma.agent.create({ data: { id: 'agent-1', name: 'Agent', handle: 'agent-1' } })
  const board = await prisma.board.create({ data: { name: 'B', projectId: project.id } })
  const task = await createTestTask({
    data: {
      title: 'T', projectId: project.id, boardId: board.id, number: 1, runState: 'RUN_QUEUED',
      assignedAgentId: agent.id, onBehalfOfUserId: member.id,
    },
  })
  await prisma.agentSession.create({ data: { id: 's1', userId: member.id, agentId: agent.id, sessionType: 'chat' } })
  seeded = { member, outsider, project, board, task, agentId: agent.id }
  return seeded
}

export function claims(overrides: Partial<CapabilityClaims> = {}): CapabilityClaims {
  return {
    tokenType: 'capability', userId: 'nobody', runner: { kind: 'person', userId: 'nobody' }, startedBy: 'person',
    agentId: 'agent-1', sessionId: 's1', projectId: null, workspaceId: null, taskId: null, role: 'MEMBER', siteId: 'site-local',
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    ...overrides,
  }
}

/** A chat run of `userId`'s, in their own storage. Its authority is that
 *  person's role as the database holds it, never `role`, which the capability
 *  carries only as a marker; set the person's role to test a floor. */
export const chatCtx = (userId: string, role: CapabilityClaims['role'] = 'MEMBER', over: Partial<CapabilityClaims> = {}): CallerContext =>
  ({ kind: 'run', claims: claims({ userId, role, runner: { kind: 'person', userId }, ...over }) })

/** A run of a task confined to `projectId`, with no person signed into it: on
 *  behalf of the task's person — by default the seeded world's task, the
 *  member's. With no project it reaches nothing. */
export const runCtx = (projectId: string | null, over: Partial<CapabilityClaims> = {}): CallerContext =>
  ({ kind: 'run', claims: claims({ role: null, projectId, taskId: seeded?.task.id ?? 'no-task', runner: projectId ? { kind: 'project', projectId } : { kind: 'person', userId: 'nobody' }, ...over }) })

/** The chat session `chatCtx` names, s1, which a run's person is read through
 *  (adr-0101). A chat's person is its capability's `userId`, so one session
 *  serves every `chatCtx` in a test. */
export async function chatSession(userId: string, agentId = 'agent-1') {
  if (agentId === 'agent-1') {
    await prisma.agent.upsert({ where: { id: agentId }, update: {}, create: { id: agentId, name: 'Agent', handle: agentId } })
  }
  await prisma.agentSession.upsert({ where: { id: 's1' }, update: {}, create: { id: 's1', userId, agentId, sessionType: 'chat' } })
}

/** Sets a person's organisation role, as an admin would. */
export function setRole(userId: string, role: 'ADMIN' | 'MEMBER') {
  return prisma.userSettings.upsert({ where: { userId }, update: { role }, create: { userId, role } })
}

/** Sets a member's role in a project, as its admin would (adr-0102): a Viewer reads it and changes nothing. */
export function setProjectRole(projectId: string, userId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
  return prisma.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role } })
}

/** `userId`'s own connection to hq, every permission on unless overridden. */
export const connCtx = (userId: string, over: Partial<ConnectionGrant> = {}): CallerContext =>
  connectionCaller({ userId, role: 'MEMBER', ...over })

export async function expectForbidden(promise: Promise<unknown>) {
  const err = await promise.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  expect(err).toMatchObject({ code: 'forbidden' })
  return err as ControlPlaneError
}
