// What the task tools' integration tests share: a project with a board, a person who works in it, an agent, a task
// assigned to that agent, and a conversation in the project whose turn answers the person. Each test file mocks
// `wasp/server`, the task runner and the mailbox itself.
import { prisma } from '../../../../test/db'
import { createAgent, createProject, createTestTask, createUserWithRole, joinProjectAs } from '../../../../test/factories'
import { turnCapability } from '../../../../server/controlplane/__tests__/turnFixtures'
import type { TurnCapability } from '../../../contract'

export const stages = [
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#000', order: 0 },
  { name: 'release', label: 'Release', status: 'IN_PROGRESS', color: '#000', order: 1 },
  { name: 'done', label: 'Done', status: 'DONE', color: '#000', order: 2 },
]

export type TaskWorld = {
  projectId: string
  projectKey: string
  boardId: string
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
  const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, columns: stages } })
  const task = await createTestTask({
    data: {
      title: 'Fix the resize step', projectId: project.id, boardId: board.id, column: 'todo', number: 214,
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
    projectId: project.id, projectKey: project.key, boardId: board.id, personId: person.id, agentId: agent.id,
    taskId: task.id, conversationId: conversation.id, capability,
  }
}

export const operationsOf = (conversationId: string) =>
  prisma.operation.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })
