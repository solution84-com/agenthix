/**
 * Closing declines what waits (conversation layer spec, Lifecycle contracts, Conversation), against the real test
 * database: once the close has committed and its closer declines, the lead's own waiting call is cancelled and a task's request is left on
 * the task's card, the conversation no longer following it; in a conversation that is not closed nothing is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createTestTask, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('../work/workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../work/settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import { sealJson, sealText } from '../sealing'
import { closeProjectConversations, closeProjectSessions, declineWaitingInProject } from '../closing'

let conversationId: string
let projectId: string
let toolOp: string
let taskOp: string

beforeEach(async () => {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent()
  const project = await createProject({ name: 'Shop' })
  await joinProjectAs(project.id, person.id, 'MEMBER')
  const conversation = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: project.id, openedById: person.id, agentId: agent.id } })
  conversationId = conversation.id
  projectId = project.id
  const task = await createTestTask({ data: { title: 'Fix it', projectId: project.id, number: 1, onBehalfOfUserId: person.id } })
  const base = { conversationId, authorisedById: person.id, state: 'WAITING_FOR_APPROVAL' as const, boundaryType: 'project' as const, boundaryId: project.id }
  toolOp = (await prisma.operation.create({
    data: { ...base, kind: 'TOOL', mode: 'FOREGROUND', toolName: 'update_task', idempotencyKey: 'a', title: sealText('Update task'), args: sealJson({}) },
  })).id
  taskOp = (await prisma.operation.create({
    data: { ...base, kind: 'TASK', mode: 'BACKGROUND', toolName: 'run_task', idempotencyKey: 'b', title: sealText('SHOP-1 Fix it'), taskId: task.id, runId: 'run-1' },
  })).id
  await prisma.$transaction(tx => closeProjectConversations(tx, project.id, 'PROJECT_DELETED'))
})

const operation = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })

describe("closing a deleted project's sessions in hq", () => {
  it('closes the sessions that worked in the project, and leaves another project\'s alone', async () => {
    const other = await createProject({ name: 'Other' })
    const worked = await createSession({ primaryOwnerType: 'project', primaryOwnerId: projectId })
    const elsewhere = await createSession({ primaryOwnerType: 'project', primaryOwnerId: other.id })

    await prisma.$transaction(tx => closeProjectSessions(tx, projectId))

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { id: worked.id } })).toMatchObject({ status: 'CLOSED', closedReason: 'PROJECT_DELETED' })
    expect(await prisma.agentSession.findUniqueOrThrow({ where: { id: elsewhere.id } })).toMatchObject({ status: 'ACTIVE', closedReason: null })
  })
})

describe('closing a conversation @SC-943', () => {
  it("cancels the lead's waiting call and stops following a task's request, leaving it to the task", async () => {
    await declineWaitingInProject(projectId)
    expect(await operation(toolOp)).toMatchObject({ state: 'CANCELLED', noReport: true })
    expect(await operation(taskOp)).toMatchObject({ state: 'DETACHED', noReport: true })
  })

  it('declines nothing in a conversation that is not closed', async () => {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'ACTIVE', closedReason: null } })
    await declineWaitingInProject(projectId)
    expect((await operation(toolOp)).state).toBe('WAITING_FOR_APPROVAL')
  })
})
