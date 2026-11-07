/**
 * *Bring up to date* and *Can't open a workspace* against the real test database (ADR-0094): pressing the button asks
 * the branch's own agent as the person, with what merging needs; a merge that clashes asks no one; and a workspace that
 * cannot be opened says why, naming its project only to a person who may see that project. The site's answers are
 * replaced: they leave hq.
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
const site = vi.hoisted(() => ({ answer: {} as Record<string, (p: Record<string, unknown>) => unknown> }))
vi.mock('../siteCalls', () => ({
  siteCall: vi.fn(async (_siteId: string, method: SiteMethodName, params: Record<string, unknown>) => {
    const answer = site.answer[method]
    if (!answer) throw new Error(`no answer for ${method}`)
    return answer(params)
  }),
}))

import * as runtime from '../../test/fakes/siteRuntimeStore'
import { prepareCodeWork } from '../codeWorkDispatch'
import { bringBranchUpToDateAction, getWorkspaceRefusalQuery, mergeBranchAction } from '../operations'
import { __resetStartingForTests } from '../working'

const MAIN = 'a'.repeat(40)

let logicalSiteId: string
let member: { id: string }
let viewer: { id: string }
let outsider: { id: string }
let projectId: string
let workspaceId: string
let n = 0

const ctx = (u: { id: string }) => ({ user: u })

beforeEach(async () => {
  site.answer = {
    'branch.list': () => ({ main: { name: 'main', head: MAIN, versions: 1 }, branches: [], overflow: false }),
    'branch.create': (p) => ({ branch: p.branch, copyId: p.copyId, head: MAIN, base: MAIN }),
  }
  __resetStartingForTests()
  runtime.reset()
  const s = await ensureExecutionSite()
  logicalSiteId = s.siteId
  member = await createUserWithRole('MEMBER')
  viewer = await createUserWithRole('MEMBER')
  outsider = await createUserWithRole('MEMBER')
  const project = await createProject({ name: 'Website relaunch', slug: `web-${++n}` })
  projectId = project.id
  await joinProjectAs(projectId, member.id, 'MEMBER')
  await joinProjectAs(projectId, viewer.id, 'VIEWER')
  workspaceId = `ws-up-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: s.id } })
  workspaceRow.current = { id: workspaceId, name: 'website-code', ownerType: 'project', ownerId: projectId, siteId: logicalSiteId, allowedTools: null }
})

async function taskBranch() {
  const agent = await createAgent({ name: 'Kernel' })
  const task = await createTestTask({ data: { title: 'Login page', projectId, number: ++n, onBehalfOfUserId: member.id, workspaceId, assignedAgentId: agent.id } })
  const made = await prepareCodeWork({
    work: { taskId: task.id }, workspaceId, owner: { type: 'project', id: projectId }, personId: member.id, agentId: agent.id, nameFrom: 'Login page', runSiteId: logicalSiteId,
  })
  made!.release()
  const branch = await prisma.workspaceBranch.findFirstOrThrow({ where: { taskId: task.id } })
  return { task, branch }
}

describe('Bring up to date', () => {
  it("asks the branch's task, as the person who pressed it, and runs it again", async () => {
    const { task, branch } = await taskBranch()
    expect(await bringBranchUpToDateAction({ branchId: branch.id }, ctx(member))).toEqual({ asked: true })
    const comment = await prisma.taskComment.findFirstOrThrow({ where: { taskId: task.id } })
    expect(comment).toMatchObject({ authorType: 'USER', userId: member.id })
    expect(comment.content).toContain(`Please bring ${branch.name} up to date with main`)
    expect(comment.content).toContain('update_from_main')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).runState).toBe('RUN_QUEUED')
  })

  it('refuses a Viewer with 403, as merging does, and asks no one', async () => {
    const { task, branch } = await taskBranch()
    await expect(bringBranchUpToDateAction({ branchId: branch.id }, ctx(viewer))).rejects.toMatchObject({ statusCode: 403 })
    await expect(mergeBranchAction({ branchId: branch.id, message: 'Login', expectedMain: MAIN }, ctx(viewer))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(0)
  })

  it('refuses a branch that is not open any more with 404', async () => {
    const { branch } = await taskBranch()
    await prisma.workspaceBranch.update({ where: { id: branch.id }, data: { state: 'MERGED', mergedAt: new Date() } })
    await expect(bringBranchUpToDateAction({ branchId: branch.id }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a merge that clashes merges nothing and asks no one: the button does', async () => {
    const { task, branch } = await taskBranch()
    site.answer['git.merge'] = () => ({ merged: false, reason: 'clash', clashes: [{ path: 'src/App.tsx', version: null }] })
    const result = await mergeBranchAction({ branchId: branch.id, message: 'Login', expectedMain: MAIN }, ctx(member))
    expect(result).toMatchObject({ outcome: 'clash', agentAsked: false })
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(0)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).runState).not.toBe('RUN_QUEUED')
  })
})

describe("why a workspace can't be opened", () => {
  it('says it is gone when no workspace has that id', async () => {
    expect(await getWorkspaceRefusalQuery({ workspaceId: 'no-such-workspace' }, ctx(member))).toEqual({ reason: 'gone' })
  })

  it('names an open project to a person who is not in it', async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(await getWorkspaceRefusalQuery({ workspaceId }, ctx(outsider))).toEqual({ reason: 'no_access', project: { name: 'Website relaunch', key: project.key } })
  })

  it('does not name a private project to a person who is not in it', async () => {
    await prisma.project.update({ where: { id: projectId }, data: { accessLevel: 'PRIVATE' } })
    expect(await getWorkspaceRefusalQuery({ workspaceId }, ctx(outsider))).toEqual({ reason: 'no_access', project: null })
  })

  it('says it can be opened to a person who may read it, a Viewer included', async () => {
    expect(await getWorkspaceRefusalQuery({ workspaceId }, ctx(viewer))).toEqual({ reason: 'open' })
  })
})
