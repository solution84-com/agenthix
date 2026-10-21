/**
 * A worker's run events into its operation, and Stop and the approval answer at its owner, against the real test
 * database (conversation layer spec, Background operation; Approval; Stopping). Each event's effect, duplicates
 * and late frames ending nothing twice, a frame from a site that does not hold the run ignored; Stop in every
 * state; approve and decline continuing the worker in a new run of the same session.
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
  const { spyMailbox } = await import('./workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import type { RunStatusEvent } from '@agenthix/core'
import * as dispatch from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { CONTINUE_AFTER_APPROVAL, REPLACED_REQUEST_REFUSAL } from '../../../../agents/manifestRequests'
import { mailbox } from '../../../coordinator/mailbox'
import { openJson } from '../../../sealing'
import { createStartWorkTool } from '../startWork'
import { pump } from '../queue'
import { handleWorkerRunStatus } from '../runEvents'
import { workerOwner } from '../owner'
import { NO_SUMMARY, RESTATE_RESULT } from '../runReads'
import { NEVER_ABORTED, world, type World } from './workerFixtures'

let w: World
const tool = createStartWorkTool({ moveOn: () => {} })
const REQUEST = { tools: [{ name: 'Bash' }], bashPatterns: [{ pattern: 'npm run bench' }] }

beforeEach(async () => {
  vi.clearAllMocks()
  w = await world()
})

/** A brief admitted and dispatched: its operation runs on run-1 at site-1. */
async function running(text = 'Profile it') {
  const outcome = await tool.run(w.capability, { boundary: w.project.key, title: text, brief: text }, NEVER_ABORTED)
  if (outcome.status !== 'accepted') throw new Error('not admitted')
  const op = await prisma.operation.findUniqueOrThrow({ where: { id: outcome.operationId } })
  await pump(op.workerSessionId!)
  return prisma.operation.findUniqueOrThrow({ where: { id: op.id } })
}
const reload = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })
const result = async (id: string) => openJson((await reload(id)).resultSummary!)

function frame(runId: string, status: RunStatusEvent['status'], over: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return { runId, sessionId: 's', taskId: null, agentId: w.agent.id, agentHandle: 'dev', status, error: null, sessionPatch: null, manifestPending: null, ...over }
}
const deliver = (e: RunStatusEvent, siteId = 'site-1') => handleWorkerRunStatus(e, siteId, id => pump(id!))
const asks = (runId: string) => frame(runId, 'COMPLETED', { manifestPending: { runId, summary: null, pendingManifest: REQUEST } })

/** The run that asked, as the site holds it. */
function siteRunAsking(sessionId: string, runId = 'run-1') {
  siteStore.addRun('site-1', { id: runId, sessionId, status: 'COMPLETED', outputText: 'I need to run the benchmark to measure the resize step.', manifestStatus: 'PENDING_APPROVAL', pendingManifest: REQUEST })
}

describe("a worker's run events @SC-962", () => {
  it('a completed run completes the operation with the result it stated, linked to the run', async () => {
    const op = await running()
    await prisma.runResult.create({ data: { runId: 'run-1', siteId: 'site-1', sessionId: op.workerSessionId!, result: 'Resize takes 40% of the time.', stated: true } })
    siteStore.addRun('site-1', { id: 'run-1', sessionId: op.workerSessionId!, outputText: 'Done.' })
    await deliver(frame('run-1', 'COMPLETED'))
    expect((await reload(op.id)).state).toBe('COMPLETED')
    expect(await result(op.id)).toEqual({ summary: 'Resize takes 40% of the time.', stated: true, runId: 'run-1' })
    expect(mailbox.operationEnded).toHaveBeenCalledWith(op.id)
  })

  it('a run that stated no result completes with its last reply, marked not stated', async () => {
    const op = await running()
    siteStore.addRun('site-1', { id: 'run-1', sessionId: op.workerSessionId!, outputText: 'I looked; the crop step is slow.' })
    await deliver(frame('run-1', 'COMPLETED'))
    expect(await result(op.id)).toEqual({ summary: 'I looked; the crop step is slow.', stated: false, runId: 'run-1' })
  })

  it("says so when the run's reply cannot be read", async () => {
    const op = await running()
    await deliver(frame('run-1', 'COMPLETED'))
    expect(await result(op.id)).toEqual({ summary: NO_SUMMARY, stated: false, runId: 'run-1' })
  })

  it('a failed run fails the operation with its error; a cancelled one cancels it', async () => {
    const a = await running('A')
    await deliver(frame('run-1', 'FAILED', { error: 'The run ran out of time' }))
    expect(await reload(a.id)).toMatchObject({ state: 'FAILED', error: 'The run ran out of time' })
    const b = await reload((await running('B')).id)
    await deliver(frame(b.runId!, 'CANCELLED', { error: 'Stopped by Sam' }))
    expect(await reload(b.id)).toMatchObject({ state: 'CANCELLED', noReport: false })
  })

  it('ends nothing twice: a duplicate or late frame is ignored', async () => {
    const op = await running()
    await deliver(frame('run-1', 'COMPLETED'))
    await deliver(frame('run-1', 'COMPLETED'))
    await deliver(frame('run-1', 'FAILED', { error: 'late' }))
    expect(mailbox.operationEnded).toHaveBeenCalledTimes(1)
    expect(await reload(op.id)).toMatchObject({ state: 'COMPLETED', error: null })
  })

  it("ignores a frame from a site that does not hold the run, and a run that is no operation's", async () => {
    const op = await running()
    await deliver(frame('run-1', 'COMPLETED'), 'site-other')
    await deliver(frame('run-unknown', 'COMPLETED'))
    expect((await reload(op.id)).state).toBe('RUNNING')
    expect(mailbox.operationEnded).not.toHaveBeenCalled()
  })

  it('a run that asks for approval leaves the operation waiting, with its last words as the reason, once', async () => {
    const op = await running()
    siteRunAsking(op.workerSessionId!)
    await deliver(asks('run-1'))
    await deliver(asks('run-1'))
    expect((await reload(op.id)).state).toBe('WAITING_FOR_APPROVAL')
    expect(mailbox.approvalRequested).toHaveBeenCalledTimes(1)
    expect(mailbox.approvalRequested).toHaveBeenCalledWith(op.id, {
      runId: 'run-1', reason: 'I need to run the benchmark to measure the resize step.', what: 'Use Bash and run “npm run bench”',
    })
    expect(mailbox.operationEnded).not.toHaveBeenCalled()
  })
})

describe('Stop @SC-965', () => {
  it('ends a queued brief at once, with no report turn, and starts nothing for it', async () => {
    await running('First')
    const queued = await tool.run(w.capability, { boundary: w.project.key, title: 'Second', brief: 'Second' }, NEVER_ABORTED)
    const id = (queued as { operationId: string }).operationId
    await workerOwner.cancel(id, w.person.id)
    expect(await reload(id)).toMatchObject({ state: 'CANCELLED', noReport: true })
    expect(dispatch.dispatchedChatRuns).toHaveLength(1)
  })

  it("stops a running brief's run on its site, and ends it with no report turn when the site says so", async () => {
    const op = await running()
    siteStore.addRun('site-1', { id: 'run-1', sessionId: op.workerSessionId!, status: 'RUNNING' })
    await workerOwner.cancel(op.id, w.person.id)
    expect(siteStore.cancelledRuns).toEqual([expect.objectContaining({ siteId: 'site-1', runId: 'run-1' })])
    expect((await reload(op.id)).state).toBe('RUNNING')
    await deliver(frame('run-1', 'CANCELLED'))
    expect(await reload(op.id)).toMatchObject({ state: 'CANCELLED', noReport: true })
  })

  it('declines a brief waiting for approval on its site, and ends it, and the next brief starts', async () => {
    const op = await running('First')
    const next = await tool.run(w.capability, { boundary: w.project.key, title: 'Second', brief: 'Second' }, NEVER_ABORTED)
    siteRunAsking(op.workerSessionId!)
    await deliver(asks('run-1'))
    await workerOwner.cancel(op.id, w.person.id)
    expect(siteStore.rejectRun).toHaveBeenCalledWith('site-1', 'run-1', 'Stopped', w.person.id)
    expect(await reload(op.id)).toMatchObject({ state: 'CANCELLED', noReport: true })
    await vi.waitFor(async () => expect((await reload((next as { operationId: string }).operationId)).state).toBe('RUNNING'))
  })

  it('does nothing to an operation that has ended', async () => {
    const op = await running()
    await deliver(frame('run-1', 'COMPLETED'))
    await workerOwner.cancel(op.id, w.person.id)
    expect((await reload(op.id)).state).toBe('COMPLETED')
    expect(siteStore.cancelledRuns).toEqual([])
  })
})

describe('the answer to an approval request @SC-964', () => {
  async function waiting() {
    const op = await running()
    siteRunAsking(op.workerSessionId!)
    await deliver(asks('run-1'))
    return op
  }

  it('approve: approved on the site, and the worker continues in a new hidden run of the same session, the operation on it', async () => {
    const op = await waiting()
    await workerOwner.answerApproval(op.id, 'approve', null, w.person.id)
    expect(siteStore.approveRun).toHaveBeenCalledWith('site-1', 'run-1', w.person.id)
    expect(dispatch.dispatchedChatRuns.at(-1)).toMatchObject({ sessionId: op.workerSessionId, inputText: `${CONTINUE_AFTER_APPROVAL}\n\n${RESTATE_RESULT}`, runId: 'run-2' })
    expect(dispatch.dispatchChatRun.mock.calls.at(-1)![4]).toEqual({ hideUserMessage: true, senderId: w.person.id })
    expect(await reload(op.id)).toMatchObject({ state: 'RUNNING', runId: 'run-2' })

    // The run that asked is done with: a late frame of it changes nothing; the new run's end completes the operation.
    await deliver(frame('run-1', 'CANCELLED'))
    expect((await reload(op.id)).state).toBe('RUNNING')
    siteStore.addRun('site-1', { id: 'run-2', sessionId: op.workerSessionId!, outputText: 'The benchmark ran: 120 ms.' })
    await deliver(frame('run-2', 'COMPLETED'))
    expect(await result(op.id)).toMatchObject({ summary: 'The benchmark ran: 120 ms.', runId: 'run-2' })
  })

  it("decline: declined on the site with the note, and the worker is told in a new run and finishes as it decides", async () => {
    const op = await waiting()
    await workerOwner.answerApproval(op.id, 'decline', 'not on the shared machine', w.person.id)
    expect(siteStore.rejectRun).toHaveBeenCalledWith('site-1', 'run-1', 'not on the shared machine', w.person.id)
    const sent = dispatch.dispatchedChatRuns.at(-1)!
    expect(sent.inputText).toContain('A person denied your request to use: Bash, the command `npm run bench`')
    expect(sent.inputText).toContain('not on the shared machine')
    expect(sent.inputText.endsWith(RESTATE_RESULT)).toBe(true)
    expect(await reload(op.id)).toMatchObject({ state: 'RUNNING', runId: 'run-2' })
    await deliver(frame('run-1', 'CANCELLED'))
    expect((await reload(op.id)).state).toBe('RUNNING')
  })

  it('a request the site no longer holds ends the operation as failed, and is refused', async () => {
    const op = await waiting()
    siteStore.approveRun.mockResolvedValueOnce({ approved: false })
    await expect(workerOwner.answerApproval(op.id, 'approve', null, w.person.id)).rejects.toThrow(REPLACED_REQUEST_REFUSAL)
    expect(await reload(op.id)).toMatchObject({ state: 'FAILED', error: REPLACED_REQUEST_REFUSAL })
  })

  it('is answered once: a second answer, or one to work not waiting, is refused', async () => {
    const op = await waiting()
    await workerOwner.answerApproval(op.id, 'approve', null, w.person.id)
    await expect(workerOwner.answerApproval(op.id, 'decline', null, w.person.id)).rejects.toThrow('This work is not waiting for an answer.')
    expect(siteStore.rejectRun).not.toHaveBeenCalled()
  })

  it("goes back to waiting when the site can't be told", async () => {
    const op = await waiting()
    siteStore.makeSiteUnreachable('site-1')
    await expect(workerOwner.answerApproval(op.id, 'approve', null, w.person.id)).rejects.toThrow()
    expect(await reload(op.id)).toMatchObject({ state: 'WAITING_FOR_APPROVAL', runId: 'run-1' })
  })
})
