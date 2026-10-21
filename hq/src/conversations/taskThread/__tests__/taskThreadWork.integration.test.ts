/**
 * Work in a task's thread (the overview's task-thread rules, 6 and 7), against the real test database: start_work
 * there is run_task on the task, with the person's ask as the run's brief; every run of the task is a card in the
 * thread, and one the thread did not commission is no operation; an approval is answered by anyone who passes the
 * asker's checks, and names them; a card notifies the people who spoke and the person the task is for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUserWithRole, joinProjectAs } from '../../../test/factories'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../coordinator/mailbox', async () => {
  const { createSettleOperation } = await import('../../work/settle')
  const mailbox = { operationSettled() {}, async operationEnded() {}, async approvalRequested() {} }
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})
const answered = vi.hoisted(() => [] as Array<{ operationId: string; answer: string; by: string }>)
// A TASK operation's owner is the real one; a call's answer is only recorded.
vi.mock('../../work/toolCalls/registryLater', () => ({
  ownerOf: async (kind: string) => kind === 'TASK' ? (await import('../../work/tasks/owner')).taskOwner : {
    async cancel() {},
    async answerApproval(operationId: string, answer: string, _note: string | null, by: string) { answered.push({ operationId, answer, by }) },
  },
  toolNamed: async () => null,
}))

import * as runnerFake from '../../../test/fakes/TaskRunner'
import * as dispatchFake from '../../../test/fakes/dispatchService'
import { openText, sealText } from '../../sealing'
import { startWorkTool, IN_A_TASK_THREAD } from '../../work/workers/startWork'
import { runTaskTool } from '../../work/tasks/runTaskTool'
import { handleTaskRunStatus } from '../../work/tasks/runListener'
import { answerConversationApproval, cancelConversationOperation } from '../../work/answerAndStop'
import { appendMessage } from '../../store/messages'
import { notifyCard } from '../../coordinator/notify'
import { briefForTaskRun } from '../brief'
import { taskWorld, type TaskWorld } from '../../work/tasks/__tests__/taskWorld'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { TurnCapability } from '../../contract'

const SITE = dispatchFake.DEFAULT_SITE_ID
const signal = new AbortController().signal
let w: TaskWorld
let threadId: string
let cap: TurnCapability & { actingUserId: string }

function frame(overrides: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return {
    runId: 'run-1', sessionId: 'task-session', taskId: w.taskId, agentId: w.agentId, agentHandle: 'dev', status: 'COMPLETED',
    error: null, sessionPatch: null, manifestPending: null, ...overrides,
  }
}

beforeEach(async () => {
  answered.length = 0
  w = await taskWorld()
  const thread = await prisma.conversation.create({ data: { home: 'TASK', taskId: w.taskId, projectId: w.projectId, openedById: w.personId } })
  threadId = thread.id
  cap = turnCapability({
    conversationId: threadId, home: 'TASK', taskId: w.taskId, projectId: w.projectId, actingUserId: w.personId, agentId: w.agentId,
  }) as TurnCapability & { actingUserId: string }
  runnerFake.taskRunner.runTask.mockImplementation(async () => ({ outcome: 'started' }))
})

describe('start_work in a task’s thread @SC-977', () => {
  it('is not offered there, and says to run the task instead', async () => {
    await expect(startWorkTool.offered(cap)).resolves.toBe(false)
    await expect(startWorkTool.run(cap, { boundary: 'x', title: 't', brief: 'b' }, { signal })).resolves.toEqual({ status: 'refused', reason: IN_A_TASK_THREAD })
  })

  it("is run_task on the thread's own task, the person's ask kept as the run's brief", async () => {
    const outcome = await runTaskTool.run(cap, { brief: 'Only the thumbnails, not the full images' }, { signal })
    expect(outcome.status).toBe('accepted')
    const [op] = await prisma.operation.findMany({ where: { conversationId: threadId } })
    expect(op).toMatchObject({ kind: 'TASK', taskId: w.taskId, toolName: 'run_task', state: 'QUEUED' })
    expect(openText(op!.brief!)).toBe('Only the thumbnails, not the full images')
    await expect(briefForTaskRun(w.taskId)).resolves.toBe('Only the thumbnails, not the full images')
  })
})

describe('Stop in a task’s thread @SC-977', () => {
  it("stops the task's run, as the task's own Stop does, rather than only no longer following it", async () => {
    const outcome = await runTaskTool.run(cap, { brief: 'Go' }, { signal })
    const operationId = (outcome as { operationId: string }).operationId
    expect((await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })).runState).toBe('RUN_QUEUED')
    await cancelConversationOperation({ conversationId: threadId, operationId }, { user: { id: w.personId } })
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ state: 'CANCELLED', noReport: true })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })).runState).toBe('RUN_NONE')
  })
})

describe('every run of the task, in its thread @SC-977', () => {
  it('is a card awaiting a report turn when the thread did not commission it, and no operation', async () => {
    await handleTaskRunStatus(frame({ runId: 'board-run' }), SITE)
    await handleTaskRunStatus(frame({ runId: 'board-run' }), SITE)
    const cards = await prisma.conversationMessage.findMany({ where: { conversationId: threadId, kind: 'RESULT' } })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ role: 'PLATFORM', operationId: null, awaitsTurn: true, turnId: null })
    expect(await prisma.operation.count({ where: { conversationId: threadId } })).toBe(0)
  })

  it('is not a card twice when the thread commissioned it', async () => {
    await runTaskTool.run(cap, { brief: 'Go' }, { signal })
    await prisma.task.update({ where: { id: w.taskId }, data: { runState: 'RUN_ACTIVE', runId: 'run-1' } })
    await handleTaskRunStatus(frame({ status: 'RUNNING' }), SITE)
    await handleTaskRunStatus(frame({ status: 'COMPLETED' }), SITE)
    expect(await prisma.conversationMessage.count({ where: { conversationId: threadId, kind: 'RESULT', operationId: null } })).toBe(0)
  })

  it('is not a card for a run that has not ended', async () => {
    await handleTaskRunStatus(frame({ runId: 'board-run', status: 'RUNNING' }), SITE)
    expect(await prisma.conversationMessage.count({ where: { conversationId: threadId } })).toBe(0)
  })
})

async function waitingRequest(): Promise<string> {
  const op = await prisma.operation.create({
    data: {
      conversationId: threadId, kind: 'TOOL', mode: 'FOREGROUND', toolName: 'update_task', idempotencyKey: 'k', state: 'WAITING_FOR_APPROVAL',
      title: sealText('Update the task'), boundaryType: 'project', boundaryId: w.projectId, authorisedById: w.personId,
    },
  })
  return op.id
}

describe('an approval in a task’s thread @SC-977', () => {
  it('is answered by another of the project’s people, who is named on the answer', async () => {
    const colleague = await createUserWithRole('MEMBER')
    await joinProjectAs(w.projectId, colleague.id)
    const operationId = await waitingRequest()
    const { messageId } = await answerConversationApproval(
      { conversationId: threadId, operationId, answer: 'approve', clientMessageId: 'a1' } as never, { user: colleague },
    )
    expect(await prisma.conversationMessage.findUniqueOrThrow({ where: { id: messageId } })).toMatchObject({ kind: 'APPROVAL_ANSWER', authorId: colleague.id })
    expect(answered).toEqual([{ operationId, answer: 'approve', by: colleague.id }])
  })

  it("is refused to a Viewer, and to anyone when the task's agent may never use the tool there", async () => {
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(w.projectId, viewer.id, 'VIEWER')
    const operationId = await waitingRequest()
    await expect(answerConversationApproval({ conversationId: threadId, operationId, answer: 'approve', clientMessageId: 'v' } as never, { user: viewer }))
      .rejects.toMatchObject({ statusCode: 409 })
    await prisma.agentOverride.create({
      data: { boundaryType: 'project', boundaryId: w.projectId, agentId: w.agentId, allowedTools: [{ name: 'update_task', state: 'never' }] },
    })
    await expect(answerConversationApproval({ conversationId: threadId, operationId, answer: 'approve', clientMessageId: 'p' } as never, { user: { id: w.personId } }))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/update_task/) })
    expect(answered).toEqual([])
  })
})

describe('a card in a task’s thread @SC-977', () => {
  it('notifies everyone who spoke there and the person the task is for, while they can see the task', async () => {
    const forWhom = await createUserWithRole('MEMBER')
    await joinProjectAs(w.projectId, forWhom.id)
    await prisma.task.update({ where: { id: w.taskId }, data: { onBehalfOfUserId: forWhom.id } })
    const left = await createUserWithRole('MEMBER')
    await joinProjectAs(w.projectId, left.id)
    const quiet = await createUserWithRole('MEMBER')
    await joinProjectAs(w.projectId, quiet.id)
    await appendMessage({ conversationId: threadId, role: 'PERSON', kind: 'TEXT', body: { text: 'Hi' }, authorId: w.personId })
    await appendMessage({ conversationId: threadId, role: 'PERSON', kind: 'TEXT', body: { text: 'Me too' }, authorId: left.id })
    await prisma.projectMember.deleteMany({ where: { projectId: w.projectId, userId: left.id } })
    const { message } = await appendMessage({
      conversationId: threadId, role: 'PLATFORM', kind: 'RESULT', body: { title: 'SHOP-214 Fix the resize step', summary: 'Done', outcome: 'completed' },
    })

    await notifyCard({ conversationId: threadId, card: message as Extract<ConversationMessageView, { kind: 'RESULT' }>, line: 'Done', approval: false })
    const told = await prisma.notification.findMany({ select: { userId: true, title: true } })
    expect(told.map(n => n.userId).sort()).toEqual([w.personId, forWhom.id].sort())
    expect(told[0]!.title).toBe('Developer')
  })
})
