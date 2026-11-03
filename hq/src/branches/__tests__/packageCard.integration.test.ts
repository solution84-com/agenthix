/**
 * A blocked package in a branch's copy with no live preview open (adr-0170), against the real test database: the
 * site's `branch.packageBlocked` puts one card in the branch's task thread, only for a copy hq made on that site and a
 * run going on that branch; a Member's press tells the site. The site's answers are replaced: they leave hq.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteMethodName } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createTestTask, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../storage/repoAttachmentService', () => ({ getAttachment: vi.fn(async () => null) }))
vi.mock('../../conversations/coordinator/notify', () => ({ notifyCard: vi.fn(async () => {}) }))
vi.mock('../../conversations/coordinator/events', () => ({ conversationEvents: { message: vi.fn(), operation: vi.fn(), operationLines: vi.fn() } }))
const workspaceRow = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))
vi.mock('../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<object>('../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async (id: string) => (workspaceRow.current?.id === id ? workspaceRow.current : null)) }
})
const site = vi.hoisted(() => ({ calls: [] as { method: string; params: Record<string, unknown> }[], answer: {} as Record<string, (p: Record<string, unknown>) => unknown> }))
vi.mock('../siteCalls', () => ({
  siteCall: vi.fn(async (_siteId: string, method: SiteMethodName, params: Record<string, unknown>) => {
    site.calls.push({ method, params })
    const answer = site.answer[method]
    if (!answer) throw new Error(`no answer for ${method}`)
    return answer(params)
  }),
}))

import * as runtime from '../../test/fakes/siteRuntimeStore'
import { prepareCodeWork } from '../codeWorkDispatch'
import { __resetStartingForTests } from '../working'
import { handlePackageBlocked } from '../packageCard'
import { answerPackageCard } from '../packageCardAnswer'
import { openJson } from '../../conversations/sealing'

const MAIN = 'a'.repeat(40)
const TIP = 'b'.repeat(40)

let logicalSiteId: string
let member: { id: string }
let viewer: { id: string }
let projectId: string
let workspaceId: string
let taskNumber = 0


function listAnswer(branches: { name: string; ahead?: number; behind?: number }[] = []) {
  return () => ({
    main: { name: 'main', head: MAIN, versions: 1 },
    branches: branches.map(b => ({ name: b.name, head: TIP, ahead: b.ahead ?? 1, behind: b.behind ?? 0, lastCommit: { id: TIP, subject: 's', author: { name: 'K', email: 'k@a.b' }, onBehalfOf: null, at: new Date().toISOString() } })),
    overflow: false,
  })
}

beforeEach(async () => {
  site.calls.length = 0
  site.answer = {
    'branch.list': listAnswer(),
    'branch.create': (p) => ({ branch: p.branch, copyId: p.copyId, head: MAIN, base: MAIN }),
    'branch.copy': (p) => ({ branch: p.branch, copyId: p.copyId, head: TIP, base: MAIN }),
    'branch.delete': () => ({ deleted: true, lostCommits: 2 }),
    'branch.rename': (p) => ({ renamed: true, name: p.to }),
    'branch.removeCopy': () => ({ removed: true }),
  }
  __resetStartingForTests()
  runtime.reset()
  const s = await ensureExecutionSite()
  logicalSiteId = s.siteId
  member = await createUserWithRole('MEMBER')
  viewer = await createUserWithRole('MEMBER')
  const project = await createProject({ name: 'Shop', slug: `shop-${++taskNumber}` })
  projectId = project.id
  await joinProjectAs(projectId, member.id, 'MEMBER')
  await joinProjectAs(projectId, viewer.id, 'VIEWER')
  workspaceId = `ws-${taskNumber}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: s.id } })
  workspaceRow.current = { id: workspaceId, name: 'shop-app', ownerType: 'project', ownerId: projectId, siteId: logicalSiteId, allowedTools: null }
})

async function taskOnWorkspace(title = 'Add a login page') {
  const agent = await createAgent({ name: 'Kernel' })
  const task = await createTestTask({ data: { title, projectId, number: ++taskNumber, onBehalfOfUserId: member.id, workspaceId, assignedAgentId: agent.id } })
  return { task, agent }
}

const ask = (taskId: string, agentId = 'no-such-agent') => ({
  work: { taskId }, workspaceId, owner: { type: 'project' as const, id: projectId }, personId: member.id, agentId, nameFrom: 'Add a login page', runSiteId: logicalSiteId,
})

async function runOnBranch() {
  const { task, agent } = await taskOnWorkspace()
  const made = await prepareCodeWork(ask(task.id, agent.id)); made!.release()
  const branch = await prisma.workspaceBranch.findFirstOrThrow({ where: { taskId: task.id } })
  const session = await prisma.agentSession.create({ data: { userId: member.id, agentId: agent.id, taskId: task.id, sessionType: 'task' } })
  runtime.addRun(logicalSiteId, { id: 'run-1', sessionId: session.id, taskId: task.id, agentId: agent.id, status: 'RUNNING' })
  return { task, branch, copyId: made!.codeWork.copyId }
}

const frame = (copyId: string, over: Record<string, unknown> = {}) => ({
  workspace: { ownerType: 'project', ownerId: projectId, workspaceId }, copyId, branch: 'add-login-page', runId: 'run-1',
  package: { ecosystem: 'npm', name: 'left-pad-ng', version: '1.0.0' },
  verdict: { allowed: false, reasons: ['tooNew'] }, facts: null, question: 'the site\'s words', at: new Date().toISOString(),
  ...over,
})

const cards = (taskId: string) => prisma.operation.findMany({
  where: { conversation: { taskId }, toolName: 'allow_package_install_script' },
})

describe('a blocked package asked about in a branch\'s copy @SC-1710', () => {
  it('puts one card in the task\'s thread for a Member or Admin, worded by HQ', async () => {
    const { task, copyId } = await runOnBranch()
    await handlePackageBlocked(logicalSiteId, frame(copyId))
    await handlePackageBlocked(logicalSiteId, frame(copyId))
    const ops = await cards(task.id)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ state: 'WAITING_FOR_APPROVAL', authorisedById: member.id, boundaryType: 'project', boundaryId: projectId })
    const args = openJson<Record<string, unknown>>(ops[0]!.args!)
    expect(args).toMatchObject({ copyId, name: 'left-pad-ng', version: '1.0.0', agentName: 'Kernel' })
    expect(String(args.question)).not.toContain('the site\'s words')
  })

  it('drops a frame from another site, for a copy that is not that branch\'s, or from a run not going on it', async () => {
    const { task, copyId } = await runOnBranch()
    await handlePackageBlocked('another-site', frame(copyId))
    await handlePackageBlocked(logicalSiteId, frame(copyId, { branch: 'other-branch' }))
    await handlePackageBlocked(logicalSiteId, frame(copyId, { runId: 'run-elsewhere' }))
    await handlePackageBlocked(logicalSiteId, frame('0f8a4c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b'))
    expect(await cards(task.id)).toHaveLength(0)
  })

  it('tells the site on a Member\'s press, as them', async () => {
    const { task, copyId } = await runOnBranch()
    await handlePackageBlocked(logicalSiteId, frame(copyId))
    const op = (await cards(task.id))[0]!
    const sent: unknown[] = []
    await answerPackageCard({ id: op.id, args: openJson<Record<string, unknown>>(op.args!) }, 'approve', member.id, {
      start: async (id: string) => (await prisma.operation.updateMany({ where: { id, state: 'WAITING_FOR_APPROVAL' }, data: { state: 'RUNNING' } })).count === 1,
      settle: async (id: string, end: { state: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DETACHED' }) =>
        (await prisma.operation.updateMany({ where: { id, state: { in: ['WAITING_FOR_APPROVAL', 'RUNNING'] } }, data: { state: end.state } })).count === 1,
      allow: async (siteId, params) => { sent.push({ siteId, params }); return true },
    })
    expect(sent).toEqual([{ siteId: logicalSiteId, params: expect.objectContaining({ copyId, personId: member.id, name: 'left-pad-ng', version: '1.0.0' }) }])
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).state).toBe('COMPLETED')
  })
})
