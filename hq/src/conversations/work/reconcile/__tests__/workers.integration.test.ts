/**
 * A standing worker's briefs reconciled with the site when it connects, against the real test database
 * (conversation layer spec, Failure, recovery and observability): a run that ended, or asked, while hq could not
 * hear it is applied once; a run the site no longer has fails its brief; a brief hq stopped while starting is
 * attached to the run the site holds for it, or started again only when the site has none; a brief being
 * continued after an approval answer continues as the site recorded the answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('../../workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as dispatch from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { CONTINUE_AFTER_APPROVAL } from '../../../../agents/manifestRequests'
import { mailbox, settleOperation } from '../../../coordinator/mailbox'
import { appendMessage } from '../../../store/messages'
import { createStartWorkTool } from '../../workers/startWork'
import { pump } from '../../workers/queue'
import { NEVER_ABORTED, briefOf, world, type World } from '../../workers/__tests__/workerFixtures'
import { reconcileWorkersOn, RUN_NOT_ON_SITE } from '../workers'
import { reconcileSiteWork } from '..'
import { onSiteReconciled, reconcileSite } from '../../../../agents/reconcileService'

const SITE = 'site-1'
let w: World
const tool = createStartWorkTool({ moveOn: () => {} })
/** A moment after every row these tests make: as if hq had restarted since. */
const restarted = () => new Date(Date.now() + 60_000)

beforeEach(async () => {
  vi.clearAllMocks()
  w = await world()
})

async function brief(text: string) {
  const outcome = await tool.run(w.capability, { boundary: w.project.key, title: text, brief: text }, NEVER_ABORTED)
  if (outcome.status !== 'accepted') throw new Error('not admitted')
  return prisma.operation.findUniqueOrThrow({ where: { id: outcome.operationId } })
}
/** A brief dispatched: running on run-1. */
async function running(text = 'Profile it') {
  const op = await brief(text)
  await pump(op.workerSessionId!)
  return prisma.operation.findUniqueOrThrow({ where: { id: op.id } })
}
const reload = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })
/** hq stopped after taking the brief and before its run was recorded. */
async function acceptedUnheard(text = 'Profile it') {
  const op = await brief(text)
  await prisma.operation.update({ where: { id: op.id }, data: { state: 'ACCEPTED' } })
  return op
}

describe('a running brief whose frames were lost @SC-966', () => {
  it('completes once with what its run stated, and the next brief starts', async () => {
    const op = await running('First')
    const next = await brief('Second')
    siteStore.addRun(SITE, { id: 'run-1', sessionId: op.workerSessionId!, status: 'COMPLETED', outputText: 'Resize is slow.' })

    // hq restarted after these rows were written: what this process takes from now on is its own to start.
    const startedAt = new Date(Date.now() + 1)
    await new Promise(resolve => setTimeout(resolve, 5))
    await Promise.all([reconcileWorkersOn(SITE, startedAt), reconcileWorkersOn(SITE, startedAt)])

    expect(await reload(op.id)).toMatchObject({ state: 'COMPLETED' })
    expect(vi.mocked(mailbox.operationEnded).mock.calls.filter(([id]) => id === op.id)).toHaveLength(1)
    await vi.waitFor(() => expect(dispatch.dispatchedChatRuns.map(r => briefOf(r.inputText))).toEqual(['First', 'Second']))
    // The run is dispatched before its id is recorded on the operation: wait for the write, not only the call.
    await vi.waitFor(async () => expect((await reload(next.id)).runId).toBe(dispatch.dispatchedChatRuns[1].runId))
  })

  it('waits for approval, asked once, when its run asked', async () => {
    const op = await running()
    siteStore.addRun(SITE, {
      id: 'run-1', sessionId: op.workerSessionId!, status: 'COMPLETED', outputText: 'I need the benchmark.',
      manifestStatus: 'PENDING_APPROVAL', pendingManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] },
    })
    await reconcileWorkersOn(SITE, restarted())
    await reconcileWorkersOn(SITE, restarted())
    expect(await reload(op.id)).toMatchObject({ state: 'WAITING_FOR_APPROVAL', runId: 'run-1' })
    expect(mailbox.approvalRequested).toHaveBeenCalledTimes(1)
  })

  it('is left running while its run still runs', async () => {
    const op = await running()
    siteStore.addRun(SITE, { id: 'run-1', sessionId: op.workerSessionId!, status: 'RUNNING' })
    await reconcileWorkersOn(SITE, restarted())
    expect((await reload(op.id)).state).toBe('RUNNING')
    expect(mailbox.operationEnded).not.toHaveBeenCalled()
  })

  it('fails, saying so, when the site no longer has its run', async () => {
    const op = await running()
    await reconcileWorkersOn(SITE, restarted())
    expect(await reload(op.id)).toMatchObject({ state: 'FAILED', error: RUN_NOT_ON_SITE })
  })

  it("is reconciled by the site's reconnect sweep", async () => {
    const op = await running()
    siteStore.addRun(SITE, { id: 'run-1', sessionId: op.workerSessionId!, status: 'FAILED', error: 'Out of memory' })
    onSiteReconciled('conversation-work', reconcileSiteWork)
    await reconcileSite(SITE, async () => {})
    expect(await reload(op.id)).toMatchObject({ state: 'FAILED', error: 'Out of memory' })
  })

  it('is left to the next connect when the site is unreachable again', async () => {
    const op = await running()
    siteStore.makeSiteUnreachable(SITE)
    await expect(reconcileSiteWork(SITE)).resolves.toBeUndefined()
    expect((await reload(op.id)).state).toBe('RUNNING')
  })
})

describe('a brief hq stopped while starting @SC-966', () => {
  it('is started again, once, when the site has no run for it', async () => {
    const op = await acceptedUnheard()
    await reconcileWorkersOn(SITE, restarted())
    expect(dispatch.dispatchedChatRuns).toHaveLength(1)
    expect(await reload(op.id)).toMatchObject({ state: 'RUNNING', runId: dispatch.dispatchedChatRuns[0].runId })
    await reconcileWorkersOn(SITE, restarted())
    expect(dispatch.dispatchedChatRuns).toHaveLength(1)
  })

  it('is attached to the run the site holds for it, and not started again', async () => {
    const op = await acceptedUnheard('Profile it')
    siteStore.addRun(SITE, { id: 'run-site', sessionId: op.workerSessionId!, status: 'RUNNING', inputText: 'Profile it' })
    await reconcileWorkersOn(SITE, restarted())
    expect(dispatch.dispatchedChatRuns).toHaveLength(0)
    expect(await reload(op.id)).toMatchObject({ state: 'RUNNING', siteId: SITE, runId: 'run-site' })
  })

  it("is not given another brief's run", async () => {
    const first = await running('First')
    siteStore.addRun(SITE, { id: 'run-1', sessionId: first.workerSessionId!, status: 'COMPLETED', inputText: 'First' })
    await settleOperation(first.id, { state: 'COMPLETED' })
    const op = await acceptedUnheard('First')
    await reconcileWorkersOn(SITE, restarted())
    expect(dispatch.dispatchedChatRuns).toHaveLength(2)
    expect((await reload(op.id)).runId).toBe(dispatch.dispatchedChatRuns[1].runId)
  })

  it('is left alone when it was taken since this process started: it is being started now', async () => {
    const op = await acceptedUnheard()
    await reconcileWorkersOn(SITE, new Date(0))
    expect(dispatch.dispatchedChatRuns).toHaveLength(0)
    expect((await reload(op.id)).state).toBe('ACCEPTED')
  })
})

describe('a brief being continued after an approval answer when hq stopped @SC-966', () => {
  async function answered(manifestStatus: 'APPROVED' | 'PENDING_APPROVAL') {
    const op = await running()
    siteStore.addRun(SITE, { id: 'run-1', sessionId: op.workerSessionId!, status: 'COMPLETED', manifestStatus, pendingManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] } })
    await appendMessage({ conversationId: w.conversation.id, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body: { title: 'x', reason: 'y', askedBy: 'Developer' }, operationId: op.id, clientMessageId: `approval:${op.id}:run-1` })
    await prisma.operation.update({ where: { id: op.id }, data: { state: 'ACCEPTED', runId: null } })
    return op
  }

  it('continues in a new hidden run when the site recorded the approval', async () => {
    const op = await answered('APPROVED')
    await reconcileWorkersOn(SITE, restarted())
    expect(dispatch.dispatchedChatRuns.at(-1)).toMatchObject({ inputText: CONTINUE_AFTER_APPROVAL })
    expect((await reload(op.id)).state).toBe('RUNNING')
  })

  it('waits for approval again when the site was never told', async () => {
    const op = await answered('PENDING_APPROVAL')
    const before = dispatch.dispatchedChatRuns.length
    await reconcileWorkersOn(SITE, restarted())
    expect(dispatch.dispatchedChatRuns).toHaveLength(before)
    expect(await reload(op.id)).toMatchObject({ state: 'WAITING_FOR_APPROVAL', runId: 'run-1' })
  })
})

describe('a queued brief @SC-966', () => {
  it('starts when the brief before it ended unheard', async () => {
    const op = await brief('Waiting')
    await reconcileWorkersOn(SITE, restarted())
    await vi.waitFor(async () => expect((await reload(op.id)).state).toBe('RUNNING'))
  })
})
