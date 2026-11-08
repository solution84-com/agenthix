/**
 * The model of a task a conversation's lead creates or runs (models from one place, part 4), against the real test
 * database: a model the person named wins; the task's own Model field next, and a later edit of it changes the next
 * run; a task the lead creates with none named keeps the conversation's model in its Model field; a task run from a
 * conversation with no model of its own runs on the conversation's, for that run only; with no conversation behind
 * the run, the defaults. The task runner is the shared fake; nothing reaches a site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CLAUDE_SDK_MODELS } from '@agenthix/core'
import { prisma } from '../../../../test/db'
process.env.SECRETS_MASTER_KEY ??= Buffer.alloc(32, 7).toString('base64')
import { createProvider, setOrgDefaults } from '../../../../routing/__tests__/routingFixtures'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../../../server/dashboard/debouncedPush', () => import('../../../../test/fakes/debouncedPush'))
vi.mock('../../../../agents/TaskRunner', () => import('../../../../test/fakes/TaskRunner'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../coordinator/mailbox', async () => {
  const { createSettleOperation } = await import('../../settle')
  const mailbox = { operationSettled() {}, async operationEnded() {}, async approvalRequested() {} }
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as runnerFake from '../../../../test/fakes/TaskRunner'
import { callOperation } from '../../../../server/controlplane/operations'
import { chooseTaskRun } from '../../../../agents/taskRunModel'
import { runTaskTool } from '../runTaskTool'
import { createTaskTool } from '../createTaskTool'
import { conversationAskOfRun } from '../taskModel'
import { taskWorld, type TaskWorld } from './taskWorld'

const signal = new AbortController().signal
const [orgs, talking, named, edited] = CLAUDE_SDK_MODELS.map(m => m.value)
let w: TaskWorld
let anthropic: { id: string }

beforeEach(async () => {
  w = await taskWorld()
  runnerFake.taskRunner.runTask.mockImplementation(async () => ({ outcome: 'started' }))
  anthropic = await createProvider({ vendor: 'anthropic' })
  await setOrgDefaults({ conversation: { providerId: anthropic.id, model: orgs } })
  await prisma.conversation.update({ where: { id: w.conversationId }, data: { talkingProviderId: anthropic.id, talkingModel: talking } })
})

/** The model the task's next run would take, as dispatch asks for it. */
async function nextRunModel(taskId: string): Promise<string | undefined> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { modelChoice: true } })
  const choice = await chooseTaskRun({ type: 'project', id: w.projectId }, { id: w.agentId }, w.personId, task.modelChoice, await conversationAskOfRun(taskId))
  return choice.resolution?.model.model
}

const create = async (input: object) => {
  const outcome = await createTaskTool.run(w.capability, {
    projectId: w.projectId, title: 'Write the release notes', assignedAgentId: w.agentId, when: 'later', ...input,
  }, { signal })
  expect(outcome.status, JSON.stringify(outcome)).toBe('done')
  return prisma.task.findFirstOrThrow({ where: { projectId: w.projectId, title: 'Write the release notes' } })
}

describe("a task's model from a conversation @SC-955", () => {
  it("1. a task created on a model the person named keeps it in its Model field", async () => {
    const task = await create({ model: `${anthropic.id}/${named}` })
    expect(task.modelChoice).toBe(`${anthropic.id}/${named}`)
    expect(await nextRunModel(task.id)).toBe(named)
  })

  it("1. a model named for one run_task wins for that run only, over the task's own", async () => {
    await prisma.task.update({ where: { id: w.taskId }, data: { modelChoice: `${anthropic.id}/${edited}` } })
    const outcome = await runTaskTool.run(w.capability, { taskId: w.taskId, model: `${anthropic.id}/${named}` }, { signal })
    expect(outcome.status, JSON.stringify(outcome)).toBe('accepted')
    expect(await nextRunModel(w.taskId)).toBe(named)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })).modelChoice).toBe(`${anthropic.id}/${edited}`)
  })

  it("2. a task's own Model field wins over the conversation's model when run from the conversation", async () => {
    await prisma.task.update({ where: { id: w.taskId }, data: { modelChoice: `${anthropic.id}/${edited}` } })
    await runTaskTool.run(w.capability, { taskId: w.taskId }, { signal })
    expect(await nextRunModel(w.taskId)).toBe(edited)
  })

  it("3. a task the lead creates with no model named keeps the conversation's model in its Model field, wherever it runs", async () => {
    const task = await create({})
    expect(task.modelChoice).toBe(`${anthropic.id}/${talking}`)
    // Run later from its board, with no conversation behind the run, it keeps that model.
    expect(await conversationAskOfRun(task.id)).toBeNull()
    expect(await nextRunModel(task.id)).toBe(talking)
  })

  it("3. editing the Model field after creation changes the next run's model, by a person or by the lead's update_task", async () => {
    const task = await create({})
    await prisma.task.update({ where: { id: task.id }, data: { modelChoice: `${anthropic.id}/${edited}` } })
    expect(await nextRunModel(task.id)).toBe(edited)
    await callOperation('update_task', { kind: 'turn', turn: w.capability }, { taskId: task.id, modelChoice: `${anthropic.id}/${named}` })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).modelChoice).toBe(`${anthropic.id}/${named}`)
    expect(await nextRunModel(task.id)).toBe(named)
    await callOperation('update_task', { kind: 'turn', turn: w.capability }, { taskId: task.id, modelChoice: null })
    expect(await nextRunModel(task.id)).toBe(orgs)
  })

  it("3. a task with no model of its own run from the conversation takes the conversation's model for that run, and stores none", async () => {
    await runTaskTool.run(w.capability, { taskId: w.taskId }, { signal })
    expect(await nextRunModel(w.taskId)).toBe(talking)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: w.taskId } })).modelChoice).toBeNull()
  })

  it('4. a task run with no conversation behind it takes the defaults', async () => {
    expect(await conversationAskOfRun(w.taskId)).toBeNull()
    expect(await nextRunModel(w.taskId)).toBe(orgs)
  })
})
