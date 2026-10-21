/**
 * Answering a task run's request for approval, for a conversation's operation (conversation layer spec, Approval),
 * against the real test database: the answer is today's answer on the task's card, given as the person who
 * answered. Approved, the operation waits for the task's next run, which the approval starts; declined, it ends
 * as cancelled with no report of its own, and the task waits for a person. An answer given on the task's card
 * moves the conversation's operation the same way. The runs live on the site, held by the siteRuntimeStore fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { ensureHqSigningKey } from '../../../../server/identity/signingKeyService'
import { ctxFor, makeMember, makeTaskRun, platformPackage } from '../../../../agents/__tests__/manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/TaskRunner', () => import('../../../../test/fakes/TaskRunner'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
const told = vi.hoisted(() => ({ ended: [] as string[] }))
vi.mock('../../../coordinator/mailbox', async () => {
  const { createSettleOperation } = await import('../../settle')
  const mailbox = { operationSettled() {}, async operationEnded(id: string) { told.ended.push(id) }, async approvalRequested() {} }
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as runnerFake from '../../../../test/fakes/TaskRunner'
import { approveManifest } from '../../../../agents/manifestActions'
import { sealText } from '../../../sealing'
import { taskOwner } from '../owner'

type Waiting = Awaited<ReturnType<typeof makeTaskRun>> & { operationId: string; answererId: string }

/** A task run waiting on a request, and a conversation's operation waiting on it. */
async function waiting(): Promise<Waiting> {
  const made = await makeTaskRun()
  const answerer = await makeMember(made.project)
  const conversation = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: made.project.id, openedById: answerer.id, agentId: made.agent.id } })
  const op = await prisma.operation.create({
    data: {
      conversationId: conversation.id, kind: 'TASK', mode: 'BACKGROUND', toolName: 'run_task', idempotencyKey: 'k1',
      state: 'WAITING_FOR_APPROVAL', title: sealText('Task'), authorisedById: answerer.id, taskId: made.task.id, runId: made.run.id,
    },
  })
  return { ...made, operationId: op.id, answererId: answerer.id }
}

const operation = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })

beforeEach(async () => {
  told.ended.length = 0
  await ensureHqSigningKey()
  await platformPackage()
})

describe('approving from the conversation @SC-971', () => {
  it("approves the run's request as the person, and the operation waits for the task's next run", async () => {
    const w = await waiting()
    await taskOwner.answerApproval(w.operationId, 'approve', null, w.answererId)
    expect(w.run.manifestStatus).toBe('APPROVED')
    expect(await operation(w.operationId)).toMatchObject({ state: 'QUEUED', runId: null })
    expect(runnerFake.taskRunner.runTask).toHaveBeenCalledTimes(1)
    expect(told.ended).toEqual([])
  })

  it('is refused for an operation that is not waiting for an answer', async () => {
    const w = await waiting()
    await prisma.operation.update({ where: { id: w.operationId }, data: { state: 'RUNNING' } })
    await expect(taskOwner.answerApproval(w.operationId, 'approve', null, w.answererId)).rejects.toThrow(/not waiting/)
    expect(w.run.manifestStatus).toBe('PENDING_APPROVAL')
  })
})

describe('declining from the conversation @SC-971', () => {
  it('declines the request; the operation ends cancelled with no report, and the task waits for a person', async () => {
    const w = await waiting()
    await taskOwner.answerApproval(w.operationId, 'decline', 'Not on the shared machine', w.answererId)
    expect(w.run.manifestStatus).toBe('REJECTED')
    expect(await operation(w.operationId)).toMatchObject({ state: 'CANCELLED', noReport: true })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })).runState).toBe('RUN_BLOCKED')
    expect(runnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })
})

describe("an answer on the task's own card @SC-971", () => {
  it("moves the conversation's operation as an answer in the conversation would", async () => {
    const w = await waiting()
    await approveManifest({ runId: w.run.id }, ctxFor(w.answererId))
    expect(await operation(w.operationId)).toMatchObject({ state: 'QUEUED', runId: null })
  })
})
