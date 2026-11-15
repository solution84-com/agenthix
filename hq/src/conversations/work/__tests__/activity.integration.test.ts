/**
 * The activity sheet's queries (conversation layer spec, Conversation activity), against the real test database:
 * what counts, the order, the words, who may stop, and *View results* with the site down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
const site = vi.hoisted(() => ({ getRun: vi.fn(), getSession: vi.fn(), listTranscript: vi.fn() }))
vi.mock('../../../sessions/siteRuntimeStore', () => site)

import { SiteUnreachableError } from '../../../storage/workspaceStore'
import { getConversationActivity, getOperationResult } from '../activity'
import { sealJson, sealText } from '../../sealing'
import { appendMessage } from '../../store/messages'

let person: { id: string }
let viewer: { id: string }
let project: { id: string; key: string; name: string }
let conversationId: string
let n = 0

const ctx = (user: { id: string }) => ({ user })

async function operation(over: Record<string, unknown> = {}) {
  const i = n++
  return prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: `k${i}`, state: 'RUNNING',
      title: sealText(`Work ${i}`), boundaryType: 'project', boundaryId: project.id, authorisedById: person.id, siteId: 'site-1', runId: `run-${i}`,
      createdAt: new Date(Date.UTC(2026, 9, 16, 10, i)),
      ...over,
    } as never,
  })
}

beforeEach(async () => {
  site.getRun.mockReset()
  site.getSession.mockReset()
  site.listTranscript.mockReset()
  const agent = await createAgent({ name: 'Developer' })
  person = await createUserWithRole('MEMBER')
  viewer = await createUserWithRole('MEMBER')
  project = await createProject({ name: 'Shop' })
  await joinProjectAs(project.id, person.id, 'MEMBER')
  await joinProjectAs(project.id, viewer.id, 'VIEWER')
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  const conversation = await createConversation({ home: 'PROJECT', openedById: person.id, projectId: project.id, agentId: agent.id } as never)
  conversationId = conversation.id
})

describe('the activity query @SC-972', () => {
  it('lists live work, newest first, in the bar\'s words; ended work is in the thread as its card', async () => {
    const queued = await operation({ state: 'QUEUED' })
    const running = await operation({ state: 'RUNNING' })
    const done = await operation({ state: 'COMPLETED' })
    const activity = await getConversationActivity({ conversationId }, ctx(person))
    expect(activity.outstanding).toBe(2)
    expect(activity.operations.map((o) => o.operationId)).toEqual([running.id, queued.id])
    expect(activity.operations.map((o) => o.word)).toEqual(['working', 'queued'])
    expect(activity.operations.map((o) => o.operationId)).not.toContain(done.id)
    expect(activity.operations[0]).toMatchObject({ title: expect.stringMatching(/^Work /), boundaryName: 'Shop', canStop: true })
  })

  it('leaves out a foreground call that returned within the wait limit', async () => {
    await operation({ kind: 'TOOL', mode: 'FOREGROUND', state: 'COMPLETED' })
    await operation({ kind: 'TOOL', mode: 'FOREGROUND', state: 'RUNNING', promoted: true })
    expect((await getConversationActivity({ conversationId }, ctx(person))).operations).toHaveLength(1)
  })

  it('shows Stop only to those who may speak', async () => {
    await operation()
    // Only the opener reads a conversation; one who only has the Viewer role in its project reads but may not speak.
    const theirs = await createConversation({ home: 'PROJECT', openedById: viewer.id, projectId: project.id } as never)
    await operation({ conversationId: theirs.id })
    const [row] = (await getConversationActivity({ conversationId: theirs.id }, ctx(viewer))).operations
    expect(row.canStop).toBe(false)
    expect((await getConversationActivity({ conversationId }, ctx(person))).operations[0].canStop).toBe(true)
  })

  it('is refused to someone who may not read the conversation', async () => {
    const stranger = await createUserWithRole('MEMBER')
    await expect(getConversationActivity({ conversationId }, ctx(stranger))).rejects.toThrow()
  })

  it('reads a task waiting in its agent\'s queue as a path', async () => {
    const agent = await createAgent({ name: 'Tester' })
    const task = await prisma.task.create({ data: { title: 'T', projectId: project.id, number: 214, assignedAgentId: agent.id, onBehalfOfUserId: person.id } as never })
    await operation({ kind: 'TASK', toolName: 'run_task', state: 'QUEUED', taskId: task.id, runId: null, siteId: null })
    const [row] = (await getConversationActivity({ conversationId }, ctx(person))).operations
    expect(row.lines).toEqual([`Shop · Tester · ${project.key}-214 — in Tester's queue`])
  })
})

describe('what the work bar reads @SC-972', () => {
  it('gives waiting work its latest request: what would run, and why', async () => {
    const op = await operation({ state: 'WAITING_FOR_APPROVAL' })
    const ask = (what: string, runId: string) => appendMessage({
      conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', operationId: op.id, clientMessageId: `approval:${op.id}:${runId}`,
      body: { title: 'Review chapter 1', what, reason: 'To compare it with last week', askedBy: 'Developer' },
    })
    await ask('Run "git log"', 'r1')
    await ask('Run "git diff"', 'r2')
    const [row] = (await getConversationActivity({ conversationId }, ctx(person))).operations
    expect(row.request).toEqual({ what: 'Run "git diff"', reason: 'To compare it with last week', askedBy: 'Developer' })
  })

  it("gives the lead's own call at Ask, which waits in its turn and is never promoted, with its request", async () => {
    const op = await operation({ kind: 'TOOL', mode: 'FOREGROUND', toolName: 'create_team', state: 'WAITING_FOR_APPROVAL', siteId: null, runId: null })
    await appendMessage({
      conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', operationId: op.id, clientMessageId: `approval:${op.id}:ask`,
      body: { title: 'Create team', what: 'Create team (name: "Design")', reason: 'To review the relaunch', askedBy: 'Developer' },
    })
    const activity = await getConversationActivity({ conversationId }, ctx(person))
    expect(activity.operations.map((o) => o.operationId)).toEqual([op.id])
    expect(activity.operations[0]).toMatchObject({ state: 'WAITING_FOR_APPROVAL', request: { what: 'Create team (name: "Design")', askedBy: 'Developer' } })
  })

  it('gives running work where its run opens', async () => {
    const running = await operation({ state: 'RUNNING', runId: 'run-9', workerSessionId: 'ws-1' })
    const rows = (await getConversationActivity({ conversationId }, ctx(person))).operations
    expect(rows.find((r) => r.operationId === running.id)?.runHref).toBe(`/runs/run-9?session=ws-1&conversation=${conversationId}`)
  })
})

describe('View results @SC-972', () => {
  it('gives the summary, and the run\'s work from its site', async () => {
    const op = await operation({ state: 'COMPLETED', resultSummary: sealJson({ summary: 'Resizing takes 40ms', stated: true, runId: 'run-x' }) })
    site.getRun.mockResolvedValue({ id: 'run-x', sessionId: 's1', startedAt: null, endedAt: null })
    site.listTranscript.mockResolvedValue([{
      role: 'TOOL', content: '', toolName: 'Read', toolInput: { file_path: '/a/b.ts' }, toolOutput: '', createdAt: '2026-10-16T10:00:00.000Z', runId: 'run-x',
    }])
    const view = await getOperationResult({ conversationId, operationId: op.id }, ctx(person))
    expect(view).toMatchObject({ summary: 'Resizing takes 40ms', stated: true, problem: null, runUrl: '/runs/run-x?session=s1' })
    expect(view.work?.steps).toHaveLength(1)
  })

  it('says plainly when the site cannot be reached, and still gives the summary', async () => {
    const op = await operation({ state: 'COMPLETED', resultSummary: sealJson({ summary: 'Done', stated: false }) })
    site.getRun.mockRejectedValue(new SiteUnreachableError('Home', 'site-1'))
    const view = await getOperationResult({ conversationId, operationId: op.id }, ctx(person))
    expect(view.summary).toBe('Done')
    expect(view.work).toBeNull()
    expect(view.problem).toMatch(/not reachable/)
  })

  it('gives a failure\'s reason as its summary', async () => {
    const op = await operation({ state: 'FAILED', error: 'The site went away', runId: null, siteId: null })
    expect((await getOperationResult({ conversationId, operationId: op.id }, ctx(person))).summary).toBe('The site went away')
  })

  it('refuses work that is not in this conversation', async () => {
    await expect(getOperationResult({ conversationId, operationId: 'nope' }, ctx(person))).rejects.toThrow()
  })
})
