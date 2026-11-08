// What the task tools' integration tests share: a project with a task type of its own, a person who works in it, an agent, a task
// assigned to that agent, and a conversation in the project whose turn answers the person. Each test file mocks
// `wasp/server`, the task runner and the mailbox itself.
import { prisma } from '../../../../test/db'
import { createAgent, createProject, createTestTask, createUserWithRole, joinProjectAs } from '../../../../test/factories'
import { turnCapability } from '../../../../server/controlplane/__tests__/turnFixtures'
import type { TurnCapability } from '../../../contract'

/** The world's task type's columns, each in its task state. */
export const stages = [
  { name: 'Backlog', state: 'BACKLOG', defaultForState: true },
  { name: 'To Do', state: 'TODO', defaultForState: true },
  { name: 'Release', state: 'IN_PROGRESS', defaultForState: true },
  { name: 'Done', state: 'DONE', defaultForState: true },
] as const

export type TaskWorld = {
  projectId: string
  projectKey: string
  typeId: string
  /** The type's columns' ids, by name. */
  columnIds: Record<(typeof stages)[number]['name'], string>
  personId: string
  agentId: string
  taskId: string
  conversationId: string
  capability: TurnCapability & { actingUserId: string }
}

export async function taskWorld(): Promise<TaskWorld> {
  const project = await createProject({ name: 'Shop' })
  const person = await createUserWithRole('MEMBER')
  await joinProjectAs(project.id, person.id)
  const agent = await createAgent({ name: 'Developer' })
  // An agent a task is given must be in its project, as the screens require.
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  const type = await prisma.taskType.create({
    data: {
      projectId: project.id, name: 'Shop flow', icon: 'task', kind: 'CUSTOM',
      columns: { create: stages.map((c, order) => ({ ...c, colour: 'neutral', order })) },
    },
    select: { id: true, columns: { select: { id: true, name: true } } },
  })
  const columnIds = Object.fromEntries(type.columns.map(c => [c.name, c.id])) as TaskWorld['columnIds']
  const task = await createTestTask({
    data: {
      title: 'Fix the resize step', projectId: project.id, typeId: type.id, columnId: columnIds['To Do'], state: 'TODO', number: 214,
      assignedAgentId: agent.id, onBehalfOfUserId: person.id,
    },
  })
  const conversation = await prisma.conversation.create({
    data: { home: 'PROJECT', projectId: project.id, openedById: person.id, agentId: agent.id },
  })
  const capability = turnCapability({
    conversationId: conversation.id, home: 'PROJECT', projectId: project.id, actingUserId: person.id, agentId: agent.id,
  }) as TurnCapability & { actingUserId: string }
  return {
    projectId: project.id, projectKey: project.key, typeId: type.id, columnIds, personId: person.id, agentId: agent.id,
    taskId: task.id, conversationId: conversation.id, capability,
  }
}

export const operationsOf = (conversationId: string) =>
  prisma.operation.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })
