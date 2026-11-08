/**
 * Who may approve or reject a pending tool manifest, and read a run's tool arguments and pending manifest, against
 * the real database. A chat session's content is its owner's alone (ADR-0041); a task run answers to its task's
 * project (ADR-0062), so an org role alone never reaches a private project's run. The three reads are routed to
 * the site holding the named session, and refuse rather than guess when none is named. The runs live on the
 * site, held here by the siteRuntimeStore fake; membership, site resolution and minting are real.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureHqSigningKey } from '../../server/identity/signingKeyService'
import { prisma } from '../../test/db'
import { createProject } from '../../test/factories'
import { ctxFor, makeChatRun, makeTaskRun, makeUser, privateProject, secondSite, platformPackage } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { approveManifest, rejectManifest } from '../manifestActions'
import { getRunManifestStatus, getSessionPendingManifest, getToolCallLog } from '../manifestQueries'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const LOG = [{ id: 'log-1', runId: 'x', toolName: 'bash', toolInput: { command: 'rm -rf /' } }] as never

beforeEach(async () => {
  await ensureHqSigningKey()
  await platformPackage()
})

/** A member and an outsider (both ADMIN in the org, so only the project rule decides), and a task run in a private project. */
async function privateTaskRun() {
  const member = await makeUser('ADMIN')
  const outsider = await makeUser('ADMIN')
  const project = await privateProject([member])
  const made = await makeTaskRun({ project })
  siteStore.addToolCalls(made.siteId, made.run.id, LOG)
  return { member, outsider, ...made }
}

describe("a task run's manifest answers to its project", () => {
  it('an org admin who is not a member may not approve it: the run stays pending and nothing starts', async () => {
    const { outsider, run } = await privateTaskRun()
    await expect(approveManifest({ runId: run.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 403 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
    expect(taskRunnerFake.startedTasks).toHaveLength(0)
  })

  it('a member may approve it', async () => {
    const { member, run } = await privateTaskRun()
    await expect(approveManifest({ runId: run.id }, ctxFor(member.id))).resolves.toEqual({ ok: true })
    expect(run.manifestStatus).toBe('APPROVED')
  })

  it('the outsider may not reject it either', async () => {
    const { outsider, run } = await privateTaskRun()
    await expect(rejectManifest({ runId: run.id, reason: 'no' }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 403 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
  })
})

// R-197: approving starts the conversation's next run, and a chat bound to a project acts in it.
describe("approving a chat run needs its owner to still belong to the chat's project @SC-645", () => {
  it('an owner removed from the project is refused, and no run is started', async () => {
    const owner = await makeUser()
    const project = await privateProject([])
    const { session, run } = await makeChatRun(owner, project)
    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('You no longer have access to this project') })
    expect(siteStore.dispatchRun).not.toHaveBeenCalled()
  })

  it('an owner still a member may approve', async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner, await privateProject([owner]))
    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))).resolves.toEqual({ ok: true })
  })

  it('a removed owner may still reject, which only stops the run', async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner, await privateProject([]))
    await expect(rejectManifest({ runId: run.id, sessionId: session.id, reason: 'no' }, ctxFor(owner.id))).resolves.toEqual({ ok: true })
    expect(run.manifestStatus).toBe('REJECTED')
  })
})

describe('reading a run: getToolCallLog, getSessionPendingManifest, getRunManifestStatus', () => {
  it('refuse a caller who is not signed in', async () => {
    const { run, session } = await makeTaskRun()
    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, {})).rejects.toMatchObject({ statusCode: 401 })
    await expect(getSessionPendingManifest({ sessionId: session.id }, {})).rejects.toMatchObject({ statusCode: 401 })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, {})).rejects.toMatchObject({ statusCode: 401 })
  })

  it("serve a chat run to its owner, and answer anyone else as if it did not exist", async () => {
    const owner = await makeUser()
    const other = await makeUser('ADMIN')
    const { run, session, siteId } = await makeChatRun(owner)
    siteStore.addToolCalls(siteId, run.id, LOG)

    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))).resolves.toHaveLength(1)
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(owner.id))).resolves.toEqual({
      runId: run.id, sessionId: session.id, summary: 'do a thing', pendingManifest: { tools: [{ name: 'Bash' }], bashPatterns: [{ pattern: 'git ', reason: 'git status' }] },
    })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))).resolves.toEqual({ manifestStatus: 'PENDING_APPROVAL' })

    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(other.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(other.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(other.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("answer 404 for a run whose own session row is gone, whatever session the caller names", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const { run, siteId } = await makeChatRun(owner)
    const { session: mine } = await makeChatRun(other)
    siteStore.addToolCalls(siteId, run.id, LOG)
    run.sessionId = 'session-removed-from-hq'

    await expect(getToolCallLog({ runId: run.id, sessionId: mine.id }, ctxFor(other.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: mine.id }, ctxFor(other.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("serve a task run in an open project to its members only, its Viewers included (adr-0099, adr-0102)", async () => {
    const member = await makeUser('MEMBER')
    const outsider = await makeUser('MEMBER')
    const project = await createProject({ name: 'Open' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'VIEWER' } })
    const { run, session, siteId } = await makeTaskRun({ project })
    siteStore.addToolCalls(siteId, run.id, LOG)
    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(member.id))).resolves.toHaveLength(1)
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(member.id))).resolves.toMatchObject({ runId: run.id })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(member.id))).resolves.toEqual({ manifestStatus: 'PENDING_APPROVAL' })

    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("serve a private project's task run to its members only", async () => {
    const { member, outsider, run, session } = await privateTaskRun()
    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(member.id))).resolves.toHaveLength(1)
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(member.id))).resolves.toMatchObject({ summary: 'do a thing' })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(member.id))).resolves.toEqual({ manifestStatus: 'PENDING_APPROVAL' })

    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(outsider.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("ask the site holding the run's session, not the install's own", async () => {
    const someone = await makeUser()
    const site = await secondSite()
    const farProject = await createProject({ name: 'Far', executionSiteId: site.id })
    await prisma.projectMember.create({ data: { projectId: farProject.id, userId: someone.id } })
    const { run, session } = await makeTaskRun({ project: farProject })
    siteStore.addToolCalls(site.siteId, run.id, LOG)

    await expect(getToolCallLog({ runId: run.id, sessionId: session.id }, ctxFor(someone.id))).resolves.toHaveLength(1)
    await expect(getRunManifestStatus({ runId: run.id, sessionId: session.id }, ctxFor(someone.id))).resolves.toEqual({ manifestStatus: 'PENDING_APPROVAL' })
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(someone.id))).resolves.toMatchObject({ runId: run.id })
  })

  it('judge entitlement by the run\'s own session, not the one named for routing', async () => {
    const owner = await makeUser()
    const caller = await makeUser()
    const theirs = await makeChatRun(owner)
    const mine = await makeChatRun(caller)
    // Both chats sit in their owners' storage on the same site: naming my session must not vouch for their run.
    await expect(getToolCallLog({ runId: theirs.run.id, sessionId: mine.session.id }, ctxFor(caller.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getRunManifestStatus({ runId: theirs.run.id, sessionId: mine.session.id }, ctxFor(caller.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuse rather than guess when no session is named', async () => {
    const { run } = await makeTaskRun()
    const someone = await makeUser()
    await expect(getToolCallLog({ runId: run.id } as never, ctxFor(someone.id))).rejects.toMatchObject({ statusCode: 400 })
    await expect(getRunManifestStatus({ runId: run.id } as never, ctxFor(someone.id))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('answer a session with no pending run with nothing', async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner)
    run.manifestStatus = 'APPROVED'
    await expect(getSessionPendingManifest({ sessionId: session.id }, ctxFor(owner.id))).resolves.toBeNull()
  })
})
