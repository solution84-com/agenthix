/**
 * A task run carrying on after its last run paused for a scheduled change (host-management spec §14): it goes into
 * the same conversation with a short note that it was paused, not the task from the beginning, and only once.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createTestTask } from '../../test/factories'
import { agentWithContent, dispatched, readyToDispatch } from './dispatchFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})

import { dispatchTaskRun, TASK_CONTINUE_MESSAGE, TASK_INPUT_MESSAGE } from '../dispatchService'
import { markTaskConversationPaused } from '../../sites/scheduled/runHold'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

/** The one run dispatched since the last call. */
function latest() {
  const run = dispatched()
  siteStore.dispatchedRuns.length = 0
  return run.payload
}

beforeEach(async () => {
  await readyToDispatch()
})

let seq = 0
async function projectTask() {
  const project = await createProject({ name: 'Web App', key: `CONT${++seq}`, slug: `cont-${seq}-${Date.now()}` })
  const person = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const agent = await agentWithContent()
  const task = await createTestTask({ data: { title: 'Fix the bug', projectId: project.id, number: 7, onBehalfOfUserId: person.id, assignedAgentId: agent.id } })
  return { agent, task }
}

describe('a task run carrying on after a pause', () => {
  it('goes into the same conversation with a note that it was paused, once, and the mark never reaches the site', async () => {
    const { agent, task } = await projectTask()
    await dispatchTaskRun(task.id, agent, 'person')
    const session = await prisma.agentSession.findUniqueOrThrow({ where: { taskId: task.id } })
    expect(latest().inputText).toBe(TASK_INPUT_MESSAGE)

    await markTaskConversationPaused(task.id)
    await dispatchTaskRun(task.id, agent, 'pulse')
    const carried = latest()
    expect(carried).toMatchObject({ inputText: TASK_CONTINUE_MESSAGE, session: { id: session.id } })
    expect(carried.session.metadata).toEqual({ agentId: agent.id })

    await dispatchTaskRun(task.id, agent, 'pulse')
    expect(latest().inputText).toBe(TASK_INPUT_MESSAGE)
  })
})
