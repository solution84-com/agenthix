/**
 * Code work on branches, against the real test database (ADR-0094): a branch and its copy when work first runs, the
 * same copy after, merging (clean, checkpoint, clash), deleting, a Viewer's refusal, and the agent's commit tool.
 * The site's answers are replaced: they leave hq. Every test here runs as shipped, with the live preview's flag off
 * (adr-0172): code work on branches does not depend on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BranchWorkError, type SiteMethodName } from '@agenthix/core'
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
import { mergeBranchAction, deleteBranchAction, getWorkspaceBranchesQuery, renameBranchAction } from '../operations'
import { markStarting, __resetStartingForTests } from '../working'
import { commitOp, mergeIntoMainOp, updateFromMainOp } from '../agentTools'
import { answerMergeCard } from '../mergeCardAnswer'
import { openJson } from '../../conversations/sealing'
import { isOrgFeatureOn } from '../../features/switches'

const MAIN = 'a'.repeat(40)
const TIP = 'b'.repeat(40)
const V2 = 'c'.repeat(40)

let logicalSiteId: string
let member: { id: string }
let viewer: { id: string }
let projectId: string
let workspaceId: string
let taskNumber = 0

const ctx = (u: { id: string }) => ({ user: u })
const callsOf = (method: string) => site.calls.filter(c => c.method === method)

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

describe("code work on branches with the live preview's flag off", () => {
  it('is how this whole file runs', async () => {
    expect(await isOrgFeatureOn('livePreview')).toBe(false)
  })
})

describe('a branch and its copy when code work first runs @SC-1669', () => {
  it('makes the branch, named from the work, and its copy, through the site', async () => {
    const { task, agent } = await taskOnWorkspace()
    const made = await prepareCodeWork(ask(task.id, agent.id))
    made!.release()
    expect(made!.codeWork).toMatchObject({ branch: 'add-login-page', main: 'main', behindMain: 0, otherBranches: [] })
    // The site's own commit at the run's end names the agent and the person as hq's commit tool does.
    expect(made!.codeWork.author).toMatchObject({ name: 'Kernel', email: expect.stringContaining('@agents.') })
    expect(made!.codeWork.onBehalfOf).toMatchObject({ email: expect.stringContaining('@people.') })
    const branch = await prisma.workspaceBranch.findFirstOrThrow({ where: { taskId: task.id }, include: { copies: true } })
    expect(branch).toMatchObject({ name: 'add-login-page', state: 'OPEN', workspaceId, userId: member.id })
    expect(branch.copies).toHaveLength(1)
    expect(branch.copies[0]).toMatchObject({ state: 'READY', folderId: made!.codeWork.copyId })
    expect(callsOf('branch.create')).toHaveLength(1)
  })

  it('uses the same copy on a later run, and makes a fresh one in the same folder when it was removed', async () => {
    const { task } = await taskOnWorkspace()
    const first = await prepareCodeWork(ask(task.id)); first!.release()
    const again = await prepareCodeWork(ask(task.id)); again!.release()
    expect(again!.codeWork.copyId).toBe(first!.codeWork.copyId)
    expect(callsOf('branch.create')).toHaveLength(1)
    await prisma.branchCopy.updateMany({ data: { state: 'REMOVED', removedAt: new Date() } })
    // The agent's harness resumes its conversation only in the folder it started in.
    const fresh = await prepareCodeWork(ask(task.id)); fresh!.release()
    expect(fresh!.codeWork.copyId).toBe(first!.codeWork.copyId)
    expect(callsOf('branch.copy')).toHaveLength(1)
    expect(await prisma.branchCopy.findMany({ select: { state: true, removedAt: true } })).toEqual([{ state: 'READY', removedAt: null }])
  })

  it('gives a fresh copy a folder of its own while the last one is still being removed', async () => {
    const { task } = await taskOnWorkspace()
    const first = await prepareCodeWork(ask(task.id)); first!.release()
    await prisma.branchCopy.updateMany({ data: { state: 'REMOVING' } })
    const fresh = await prepareCodeWork(ask(task.id)); fresh!.release()
    expect(fresh!.codeWork.copyId).not.toBe(first!.codeWork.copyId)
  })

  it('takes the next name when the repository has the name already @SC-1670', async () => {
    site.answer['branch.list'] = listAnswer([{ name: 'add-login-page' }])
    const { task } = await taskOnWorkspace()
    const made = await prepareCodeWork(ask(task.id)); made!.release()
    expect(made!.codeWork.branch).toBe('add-login-page-2')
  })

  it('is not code work when the workspace is not a Git repository, and leaves no row', async () => {
    site.answer['branch.list'] = () => { throw new BranchWorkError('not_repository', 'x') }
    const { task } = await taskOnWorkspace()
    expect(await prepareCodeWork(ask(task.id))).toBeNull()
    expect(await prisma.workspaceBranch.count({ where: { taskId: task.id } })).toBe(0)
  })

  it('makes one branch when two runs of the work start at once', async () => {
    const { task } = await taskOnWorkspace()
    const results = await Promise.allSettled([prepareCodeWork(ask(task.id)), prepareCodeWork(ask(task.id))])
    for (const r of results) if (r.status === 'fulfilled') r.value?.release()
    expect(results.some(r => r.status === 'fulfilled')).toBe(true)
    expect(await prisma.workspaceBranch.count({ where: { taskId: task.id, state: 'OPEN' } })).toBe(1)
    expect(callsOf('branch.create')).toHaveLength(1)
  })

  it('leaves no row behind when the site makes nothing', async () => {
    site.answer['branch.create'] = () => { throw new Error('site failed') }
    const { task } = await taskOnWorkspace()
    await expect(prepareCodeWork(ask(task.id))).rejects.toThrow('site failed')
    expect(await prisma.workspaceBranch.count({ where: { taskId: task.id } })).toBe(0)
  })
})

async function openBranch() {
  const { task, agent } = await taskOnWorkspace()
  const made = await prepareCodeWork(ask(task.id)); made!.release()
  const branch = await prisma.workspaceBranch.findFirstOrThrow({ where: { taskId: task.id } })
  return { task, agent, branch }
}

describe('merging into main @SC-1679', () => {
  it('merges as one version and closes the branch when no agent works on it', async () => {
    const { branch } = await openBranch()
    site.answer['git.merge'] = () => ({ merged: true, version: { number: 2, commit: V2, subject: 's', author: { name: 'M', email: 'm@a.b' }, files: 1, at: '' }, mergedCommit: TIP })
    const result = await mergeBranchAction({ branchId: branch.id, message: 'Kernel for Mia · Login page', expectedMain: MAIN }, ctx(member))
    expect(result).toMatchObject({ outcome: 'merged', versionNumber: 2, branchClosed: true })
    const after = await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id }, include: { copies: true } })
    expect(after).toMatchObject({ state: 'MERGED', lastMergedCommit: TIP, lastMergedVersion: V2 })
    expect(after.copies.every(c => c.state === 'REMOVED')).toBe(true)
    expect(callsOf('git.merge')[0]!.params).toMatchObject({ branch: 'add-login-page', base: null, expectedMain: MAIN })
    expect(callsOf('branch.delete')).toHaveLength(1)
  })

  it('is a checkpoint while an agent works: the branch stays open, and the next merge counts from it', async () => {
    const { task, agent, branch } = await openBranch()
    const session = await prisma.agentSession.create({ data: { userId: member.id, agentId: agent.id, taskId: task.id, sessionType: 'task' } })
    runtime.addRun(logicalSiteId, { id: 'run-1', sessionId: session.id, taskId: task.id, agentId: agent.id, status: 'RUNNING' })
    site.answer['git.merge'] = () => ({ merged: true, version: { number: 2, commit: V2, subject: 's', author: { name: 'M', email: 'm@a.b' }, files: 1, at: '' }, mergedCommit: TIP })
    const result = await mergeBranchAction({ branchId: branch.id, message: 'Checkpoint', expectedMain: MAIN }, ctx(member))
    expect(result).toMatchObject({ outcome: 'merged', branchClosed: false })
    expect(await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).toMatchObject({ state: 'OPEN', lastMergedCommit: TIP })
    await mergeBranchAction({ branchId: branch.id, message: 'Again', expectedMain: V2 }, ctx(member))
    expect(callsOf('git.merge')[1]!.params.base).toEqual({ mergedCommit: TIP, mergedVersion: V2 })
  })

  it('merges nothing on a clash and asks the task to run again, as the person', async () => {
    const { task, branch } = await openBranch()
    site.answer['git.merge'] = () => ({ merged: false, reason: 'clash', clashes: [{ path: 'src/login.ts', version: null }] })
    const result = await mergeBranchAction({ branchId: branch.id, message: 'Login', expectedMain: MAIN }, ctx(member))
    expect(result).toMatchObject({ outcome: 'clash', agentAsked: true })
    const comment = await prisma.taskComment.findFirstOrThrow({ where: { taskId: task.id } })
    expect(comment).toMatchObject({ authorType: 'USER', userId: member.id })
    expect(comment.content).toContain('src/login.ts')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).runState).toBe('RUN_QUEUED')
    expect((await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).state).toBe('OPEN')
  })

  it('says main moved when the dialog is stale, and changes nothing', async () => {
    const { branch } = await openBranch()
    site.answer['git.merge'] = () => ({ merged: false, reason: 'main_moved', main: V2 })
    expect(await mergeBranchAction({ branchId: branch.id, message: 'Login', expectedMain: MAIN }, ctx(member))).toEqual({ outcome: 'main_moved' })
    expect((await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).lastMergedCommit).toBeNull()
  })

  it('refuses a Viewer with 403, before the site is asked @SC-1692', async () => {
    const { branch } = await openBranch()
    await expect(mergeBranchAction({ branchId: branch.id, message: 'Login', expectedMain: MAIN }, ctx(viewer))).rejects.toMatchObject({ statusCode: 403 })
    expect(callsOf('git.merge')).toHaveLength(0)
  })
})

describe('deleting and renaming a branch @SC-1676', () => {
  it('deletes an unmerged branch whose work is over, and says how many commits are lost', async () => {
    const { branch } = await openBranch()
    expect(await deleteBranchAction({ branchId: branch.id }, ctx(member))).toEqual({ lostCommits: 2 })
    expect((await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).state).toBe('DELETED')
  })

  it('refuses while a run is starting on it, and keeps it open', async () => {
    const { branch } = await openBranch()
    markStarting(branch.id)
    await expect(deleteBranchAction({ branchId: branch.id }, ctx(member))).rejects.toMatchObject({ statusCode: 409 })
    expect((await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).state).toBe('OPEN')
    expect(callsOf('branch.delete')).toHaveLength(0)
  })

  it('opens the branch again when the site deletes nothing', async () => {
    const { branch } = await openBranch()
    site.answer['branch.delete'] = () => { throw new Error('site failed') }
    await expect(deleteBranchAction({ branchId: branch.id }, ctx(member))).rejects.toThrow()
    expect((await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).state).toBe('OPEN')
  })

  it('renames to a work branch name, and refuses any other', async () => {
    const { branch } = await openBranch()
    await expect(renameBranchAction({ branchId: branch.id, name: 'Main Thing' }, ctx(member))).rejects.toMatchObject({ statusCode: 400 })
    expect(await renameBranchAction({ branchId: branch.id, name: 'sign-in-page' }, ctx(member))).toEqual({ name: 'sign-in-page' })
    expect((await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branch.id } })).name).toBe('sign-in-page')
  })
})

describe("the workspace's branches, as the branch select reads them @SC-1678", () => {
  it('lists main and the open branches, with whose they are, for a Viewer too', async () => {
    const { branch } = await openBranch()
    site.answer['branch.list'] = listAnswer([{ name: 'add-login-page', ahead: 3, behind: 1 }])
    const view = await getWorkspaceBranchesQuery({ workspaceId }, ctx(viewer))
    expect(view).toMatchObject({ git: true, canAct: false, main: { name: 'main', head: MAIN } })
    if (!view.git) throw new Error('expected git')
    expect(view.branches).toEqual([expect.objectContaining({
      id: branch.id, name: 'add-login-page', ahead: 3, behind: 1, agentName: 'Kernel', working: null,
      whose: expect.objectContaining({ kind: 'task', title: 'Add a login page', personId: member.id }),
    })])
  })
})

describe("the agent's commit tool @SC-1671", () => {
  it('commits in the calling run\'s own copy, as the agent on behalf of the person', async () => {
    const { task, agent, branch } = await openBranch()
    const session = await prisma.agentSession.create({ data: { userId: member.id, agentId: agent.id, taskId: task.id, sessionType: 'task' } })
    runtime.addRun(logicalSiteId, { id: 'run-1', sessionId: session.id, taskId: task.id, agentId: agent.id, status: 'RUNNING' })
    site.answer['branch.commit'] = () => ({ committed: true, commit: TIP, files: 2, back: { head: TIP, previous: MAIN, moved: true, backup: null } })
    const claims = { siteId: logicalSiteId, sessionId: session.id, taskId: task.id, agentId: agent.id, userId: member.id, projectId, onBehalfOfUserId: null }
    const result = await commitOp({ kind: 'run', claims: claims as never }, { message: 'Add the login form', runId: 'run-1' })
    expect(result).toEqual({ committed: true, commit: TIP, branch: branch.name, files: 2 })
    const sent = callsOf('branch.commit')[0]!.params
    expect(sent).toMatchObject({ branch: branch.name, runId: 'run-1', author: { name: 'Kernel' } })
    expect(sent.onBehalfOf).toMatchObject({ email: expect.stringContaining('@people.') })
  })

  it('refuses a run that is not this capability\'s', async () => {
    const { task, agent } = await openBranch()
    const session = await prisma.agentSession.create({ data: { userId: member.id, agentId: agent.id, taskId: task.id, sessionType: 'task' } })
    runtime.addRun(logicalSiteId, { id: 'other', sessionId: 'another-session', taskId: null, agentId: agent.id, status: 'RUNNING' })
    const claims = { siteId: logicalSiteId, sessionId: session.id, taskId: task.id, agentId: agent.id, userId: member.id, projectId, onBehalfOfUserId: null }
    await expect(commitOp({ kind: 'run', claims: claims as never }, { message: 'x', runId: 'other' })).rejects.toMatchObject({ code: 'forbidden' })
    expect(callsOf('branch.commit')).toHaveLength(0)
  })
})

describe("the agent's update_from_main tool @SC-1672", () => {
  async function onBranch() {
    const { task, agent, branch } = await openBranch()
    const session = await prisma.agentSession.create({ data: { userId: member.id, agentId: agent.id, taskId: task.id, sessionType: 'task' } })
    runtime.addRun(logicalSiteId, { id: 'run-u', sessionId: session.id, taskId: task.id, agentId: agent.id, status: 'RUNNING' })
    site.answer['branch.list'] = listAnswer([{ name: branch.name }])
    const claims = { siteId: logicalSiteId, sessionId: session.id, taskId: task.id, agentId: agent.id, userId: member.id, projectId, onBehalfOfUserId: null }
    return { branch, call: () => updateFromMainOp({ kind: 'run', claims: claims as never }, { runId: 'run-u' }) }
  }

  it('merges main into the calling run\'s copy as the agent for the person, and says what to do next', async () => {
    const { branch, call } = await onBranch()
    site.answer['branch.updateFromMain'] = () => ({ outcome: 'updated', commit: TIP, fastForward: false, back: { head: TIP, previous: MAIN, moved: true, backup: null } })
    expect(await call()).toMatchObject({ updated: true, branch: branch.name, main: 'main', commit: TIP })
    const sent = callsOf('branch.updateFromMain')[0]!.params
    expect(sent).toMatchObject({ branch: branch.name, runId: 'run-u', author: { name: 'Kernel' } })
    expect(sent.onBehalfOf).toMatchObject({ email: expect.stringContaining('@people.') })
  })

  it('names the clashing files and tells the agent to resolve them and commit', async () => {
    const { call } = await onBranch()
    site.answer['branch.updateFromMain'] = () => ({ outcome: 'clashes', paths: ['src/app.css'], mainTip: V2 })
    const result = await call()
    expect(result).toMatchObject({ updated: false, reason: 'clashes', paths: ['src/app.css'] })
    expect(result.note).toContain('then call commit')
  })
})

describe("the agent's merge tool asks the person, and a press merges @SC-1681", () => {
  async function runOnBranch() {
    const { task, agent, branch } = await openBranch()
    const session = await prisma.agentSession.create({ data: { userId: member.id, agentId: agent.id, taskId: task.id, sessionType: 'task' } })
    runtime.addRun(logicalSiteId, { id: 'run-1', sessionId: session.id, taskId: task.id, agentId: agent.id, status: 'RUNNING' })
    const claims = { siteId: logicalSiteId, sessionId: session.id, taskId: task.id, agentId: agent.id, userId: member.id, projectId, onBehalfOfUserId: member.id }
    return { task, branch, caller: { kind: 'run' as const, claims: claims as never } }
  }
  const mergeAnswer = () => ({ merged: true, version: { number: 2, commit: V2, subject: 's', author: { name: 'M', email: 'm@a.b' }, files: 1, at: '' }, mergedCommit: TIP })
  const deps = () => ({
    start: async (id: string) => (await prisma.operation.updateMany({ where: { id, state: 'WAITING_FOR_APPROVAL' }, data: { state: 'RUNNING' } })).count === 1,
    settle: async (id: string, end: { state: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DETACHED' }) =>
      (await prisma.operation.updateMany({ where: { id, state: { in: ['WAITING_FOR_APPROVAL', 'RUNNING'] } }, data: { state: end.state } })).count === 1,
  })
  const cardOf = async (taskId: string) => {
    const thread = await prisma.conversation.findUniqueOrThrow({ where: { taskId } })
    const op = await prisma.operation.findFirstOrThrow({ where: { conversationId: thread.id, toolName: 'merge_branch_into_main' } })
    return { thread, op, row: { id: op.id, conversationId: thread.id, args: openJson<Record<string, unknown>>(op.args!) } }
  }

  it("never merges on the agent's call: it puts a card in the task's thread, once", async () => {
    const { task, branch, caller } = await runOnBranch()
    site.answer['git.merge'] = mergeAnswer
    const first = await mergeIntoMainOp(caller, { runId: 'run-1' })
    expect(first).toMatchObject({ asked: true, branch: branch.name, main: 'main', alreadyAsked: false })
    expect(await mergeIntoMainOp(caller, { runId: 'run-1' })).toMatchObject({ asked: true, alreadyAsked: true })
    expect(callsOf('git.merge')).toHaveLength(0)
    const { thread, op } = await cardOf(task.id)
    expect(op).toMatchObject({ state: 'WAITING_FOR_APPROVAL', authorisedById: member.id, boundaryType: 'project', boundaryId: projectId })
    expect(await prisma.conversationMessage.count({ where: { conversationId: thread.id, kind: 'APPROVAL_REQUEST', operationId: op.id } })).toBe(1)
  })

  it("merges on a Member's press, as them, onto the main the card was made against; a second press does nothing", async () => {
    const { task, caller } = await runOnBranch()
    site.answer['git.merge'] = mergeAnswer
    await mergeIntoMainOp(caller, { runId: 'run-1' })
    const { row } = await cardOf(task.id)
    await answerMergeCard(row, 'approve', member.id, deps())
    expect(callsOf('git.merge')).toHaveLength(1)
    expect(callsOf('git.merge')[0]!.params).toMatchObject({ expectedMain: MAIN, author: { email: expect.stringContaining('@people.') } })
    await expect(answerMergeCard(row, 'approve', member.id, deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(callsOf('git.merge')).toHaveLength(1)
  })

  it("merges nothing on a Viewer's press", async () => {
    const { task, caller } = await runOnBranch()
    site.answer['git.merge'] = mergeAnswer
    await mergeIntoMainOp(caller, { runId: 'run-1' })
    const { row, op } = await cardOf(task.id)
    await expect(answerMergeCard(row, 'approve', viewer.id, deps())).rejects.toMatchObject({ statusCode: 403 })
    expect(callsOf('git.merge')).toHaveLength(0)
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).state).toBe('WAITING_FOR_APPROVAL')
  })

  it('refuses a stale card: main moved since the card was made, and the dialog is offered', async () => {
    const { task, caller } = await runOnBranch()
    await mergeIntoMainOp(caller, { runId: 'run-1' })
    site.answer['git.merge'] = () => ({ merged: false, reason: 'main_moved', main: V2 })
    const { thread, row, op } = await cardOf(task.id)
    await answerMergeCard(row, 'approve', member.id, deps())
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).state).toBe('FAILED')
    expect(await prisma.conversationMessage.count({ where: { conversationId: thread.id, kind: 'ACTION' } })).toBe(1)
  })
})

