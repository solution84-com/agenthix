/**
 * Shared set-up for the automation tests over the control plane
 * (automation*.integration.test.ts, scheduleOps.integration.test.ts): an open
 * project p (u1 is its Member) with board b1, the run's own task t0 (done on u1's behalf), a
 * queued task t1 assigned to agent-2, and the run's task session s1, whose
 * routing identity is someone else.
 */
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createProject, createTestTask } from '../../../test/factories'
import type { CallerContext } from '../types'
import { claims } from './controlPlaneFixtures'

export type AutomationWorld = { projectId: string; boardId: string; u1: string; routingAdmin: string }

export const autoQueueStages = [
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#000', order: 0 },
  { name: 'ready', label: 'Ready', status: 'TODO', color: '#000', order: 1 },
  { name: 'done', label: 'Done', status: 'DONE', color: '#000', order: 2 },
]

export async function seedAutomation(): Promise<AutomationWorld> {
  const project = await createProject({ accessLevel: 'OPEN' })
  const [u1, routingAdmin] = [await prisma.user.create({ data: {} }), await prisma.user.create({ data: {} })]
  await prisma.projectMember.create({ data: { projectId: project.id, userId: u1.id } })
  // A run is held to its person's role in the project (adr-0101, adr-0102).
  await prisma.userSettings.create({ data: { userId: u1.id, role: 'MEMBER' } })
  await prisma.agent.createMany({ data: [{ id: 'agent-1', name: 'One', handle: 'agent-1' }, { id: 'agent-2', name: 'Two', handle: 'b' }] })
  const board = await prisma.board.create({ data: { id: 'b1', name: 'B', projectId: project.id, columns: autoQueueStages } })
  await createTestTask({ data: { id: 't0', title: 'own', projectId: project.id, boardId: board.id, number: 1, onBehalfOfUserId: u1.id } })
  await createTestTask({
    data: { id: 't1', title: 'queued', projectId: project.id, boardId: board.id, column: 'todo', number: 2, runState: 'RUN_QUEUED', assignedAgentId: 'agent-2', onBehalfOfUserId: u1.id },
  })
  await prisma.agentSession.create({ data: { id: 's1', userId: routingAdmin.id, agentId: 'agent-1', sessionType: 'task', taskId: 't0' } })
  return { projectId: project.id, boardId: board.id, u1: u1.id, routingAdmin: routingAdmin.id }
}

/** A run of t0's task in project p, started by `startedBy` unless overridden. */
export const taskRun = (w: AutomationWorld, over: Partial<CapabilityClaims> = {}): CallerContext =>
  ({ kind: 'run', claims: claims({ userId: w.routingAdmin, role: null, projectId: w.projectId, taskId: 't0', runner: { kind: 'project', projectId: w.projectId }, ...over }) })

/** Whether the project lets its agents set start times (the organisation must allow it too), and the organisation's maximum depth. */
export async function projectAutomation(projectId: string, data: { maxDepth?: number; agentSchedules?: boolean }) {
  if (data.agentSchedules !== undefined) await prisma.project.update({ where: { id: projectId }, data: { agentSchedules: data.agentSchedules } })
  const org = await prisma.org.findFirst({ select: { id: true } })
  const orgData = { ...(data.maxDepth !== undefined ? { automationMaxDepth: data.maxDepth } : {}), ...(data.agentSchedules ? { automationAgentSchedules: true } : {}) }
  if (org) await prisma.org.update({ where: { id: org.id }, data: orgData })
  else await prisma.org.create({ data: { name: 'Org', ...orgData } })
}

export const setOwnDepth = (queueDepth: number) => prisma.task.update({ where: { id: 't0' }, data: { queueDepth } })
