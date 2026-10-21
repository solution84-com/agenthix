/**
 * A tool request from a run started by a message into a task's session tells its sender (every-screen-reviewed
 * spec §9), against the real database: the frame must come from the site holding the session, and a sender no
 * longer on the project is not told — the task's person is. The run lives on the siteRuntimeStore fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
import { prisma } from '../../test/db'
import { makeTaskRun, makeUser, privateProject } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
type Listener = (e: RunStatusEvent, siteId: string) => Promise<void>
const listeners = vi.hoisted(() => new Map<string, Listener>())
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: (name: string, l: Listener) => listeners.set(name, l) }))

import { registerTaskSessionApprovalListener } from '../taskSessionApproval'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

beforeEach(() => registerTaskSessionApprovalListener())

async function messageRunAsking() {
  const sender = await makeUser()
  const made = await makeTaskRun({ project: await privateProject([]) })
  await prisma.projectMember.create({ data: { projectId: made.project.id, userId: sender.id } })
  const run = siteStore.addRun(made.siteId, {
    id: `msg-${made.task.id}`, sessionId: made.session.id, agentId: made.agent.id, taskId: null,
    metadata: { dispatch: { kind: 'chat', startedBy: 'person', onBehalfOfUserId: sender.id } },
  })
  const frame: RunStatusEvent = {
    runId: run.id, sessionId: made.session.id, taskId: null, agentId: made.agent.id, agentHandle: made.agent.handle,
    status: 'COMPLETED', error: null, sessionPatch: null,
    manifestPending: { runId: run.id, summary: null, pendingManifest: { tools: [], bashPatterns: [] } },
  }
  return { ...made, sender, frame }
}

const tell = (e: RunStatusEvent, siteId: string) => listeners.get('task-session-approval')!(e, siteId)
const notified = (userId: string) => prisma.notification.count({ where: { userId } })

describe("a tool request in a task's session tells the person whose message started the run @SC-521", () => {
  it('tells the sender, not the task\'s person', async () => {
    const { sender, task, frame, siteId } = await messageRunAsking()
    await tell(frame, siteId)
    expect(await notified(sender.id)).toBe(1)
    expect(await notified(task.onBehalfOfUserId)).toBe(0)
  })

  it("tells the task's person when the sender has left the project", async () => {
    const { sender, task, frame, siteId, project } = await messageRunAsking()
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: sender.id } } })
    await tell(frame, siteId)
    expect(await notified(sender.id)).toBe(0)
    expect(await notified(task.onBehalfOfUserId)).toBe(1)
  })

  it('ignores a frame from a site that does not hold the session', async () => {
    const { sender, frame } = await messageRunAsking()
    await tell(frame, 'some-other-site')
    expect(await notified(sender.id)).toBe(0)
  })

  it("leaves a task run's request and a frame with no request to the task machine", async () => {
    const { sender, frame, siteId, task } = await messageRunAsking()
    await tell({ ...frame, taskId: task.id }, siteId)
    await tell({ ...frame, manifestPending: null }, siteId)
    expect(await prisma.notification.count()).toBe(0)
    expect(await notified(sender.id)).toBe(0)
  })
})
