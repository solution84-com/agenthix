/**
 * Briefs queue in hq, one at a time per standing worker, against the real test database (conversation layer spec,
 * Conversation activity): the first dispatches as a run of the worker's session on the boundary's model, the rest
 * wait queued and start in order as each ends; briefs to two boundaries run at once; a brief that cannot start
 * fails with why and the next one starts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CLAUDE_SDK_MODELS } from '@agenthix/core'
import { prisma } from '../../../../test/db'
import { createUserWithRole, joinProjectAs } from '../../../../test/factories'
process.env.SECRETS_MASTER_KEY ??= Buffer.alloc(32, 7).toString('base64')
import { createProvider, setAgentChoices, setList, setOrgDefaults } from '../../../../routing/__tests__/routingFixtures'

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

import * as dispatch from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { SiteUnreachableError } from '../../../../storage/workspaceStore'
import { mailbox } from '../../../coordinator/mailbox'
import { openJson, sealJson } from '../../../sealing'
import type { WorkerArgs } from '../runReads'
import { createStartWorkTool } from '../startWork'
import { dispatchAccepted, pump } from '../queue'
import { handleWorkerRunStatus } from '../runEvents'
import { NEVER_ABORTED, world, type World } from './workerFixtures'

let w: World
const tool = createStartWorkTool({ moveOn: () => {} })

beforeEach(async () => {
  vi.clearAllMocks()
  w = await world()
})

async function brief(text: string, over: Record<string, unknown> = {}) {
  const outcome = await tool.run(w.capability, { boundary: w.project.key, title: text, brief: text, ...over }, NEVER_ABORTED)
  if (outcome.status !== 'accepted') throw new Error(`not admitted: ${JSON.stringify(outcome)}`)
  return prisma.operation.findUniqueOrThrow({ where: { id: outcome.operationId } })
}
const state = async (id: string) => (await prisma.operation.findUniqueOrThrow({ where: { id } })).state
const frame = (runId: string, status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED') =>
  ({ runId, sessionId: 's', taskId: null, agentId: w.agent.id, agentHandle: 'dev', status, error: null, sessionPatch: null, manifestPending: null })

describe("one standing worker's briefs @SC-960", () => {
  it('run one at a time, oldest first, each starting when the one before ends', async () => {
    const first = await brief('First')
    const second = await brief('Second')
    await pump(first.workerSessionId!)
    expect(dispatch.dispatchedChatRuns.map(r => r.inputText)).toEqual(['First'])
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ state: 'RUNNING', siteId: 'site-1', runId: 'run-1' })
    expect(await state(second.id)).toBe('QUEUED')

    await pump(first.workerSessionId!)
    expect(dispatch.dispatchedChatRuns).toHaveLength(1)

    await handleWorkerRunStatus(frame('run-1', 'COMPLETED'), 'site-1', id => pump(id!))
    expect(await state(first.id)).toBe('COMPLETED')
    expect(dispatch.dispatchedChatRuns.map(r => r.inputText)).toEqual(['First', 'Second'])
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ state: 'RUNNING', runId: 'run-2' })
  })

  it('run as the worker session, on behalf of the person who asked, shown in its run', async () => {
    const op = await brief('Check the README')
    await pump(op.workerSessionId!)
    const [sessionId, input, agent, , opts] = dispatch.dispatchChatRun.mock.calls[0]
    expect(sessionId).toBe(op.workerSessionId)
    expect(input).toBe('Check the README')
    expect(agent.id).toBe(w.agent.id)
    expect(opts).toEqual({ hideUserMessage: false, senderId: w.person.id, choice: expect.objectContaining({ runtime: expect.any(String) }) })
  })

  it('run with the skill the person picked for the message it answers, and an approval\'s run without it', async () => {
    await prisma.conversationMessage.create({
      data: { conversationId: w.conversation.id, seq: 1, role: 'PERSON', kind: 'TEXT', body: sealJson({ text: 'review', skill: { name: 'org-code-review' } }), authorId: w.person.id, turnId: w.capability.turnId },
    })
    const op = await brief('Review the change')
    await pump(op.workerSessionId!)
    expect(dispatch.dispatchChatRun.mock.calls[0][4]).toEqual({ hideUserMessage: false, senderId: w.person.id, choice: expect.anything(), skill: { name: 'org-code-review' } })

    await prisma.operation.update({ where: { id: op.id }, data: { state: 'ACCEPTED' } })
    await dispatchAccepted(op.id, { text: 'Carry on.', hidden: true })
    expect(dispatch.dispatchChatRun.mock.calls[1][4]).toEqual({ hideUserMessage: true, senderId: w.person.id, choice: expect.anything() })
  })

  it("run on the agent's default model, else the organisation's, while the conversation has none, whatever effort the brief names @SC-955", async () => {
    const [orgs, agents] = CLAUDE_SDK_MODELS.map(m => m.value)
    const anthropic = await createProvider({ vendor: 'anthropic' })
    await setOrgDefaults({ conversation: { providerId: anthropic.id, model: orgs } })
    const a = await brief('Light job')
    await pump(a.workerSessionId!)
    await handleWorkerRunStatus(frame('run-1', 'COMPLETED'), 'site-1', () => {})
    await setAgentChoices(w.agent.id, { conversation: { providerId: anthropic.id, model: agents } })
    const b = await brief('Heavy job', { effort: 'heavy' })
    await pump(b.workerSessionId!)
    expect(dispatch.dispatchChatRun.mock.calls.map(c => c[3])).toEqual([orgs, agents])
  })

  it('run on the model the conversation talks on, the one the person picked, and a later pick applies to the next brief @SC-955', async () => {
    const [orgs, picked, later] = CLAUDE_SDK_MODELS.map(m => m.value)
    const anthropic = await createProvider({ vendor: 'anthropic' })
    await setOrgDefaults({ conversation: { providerId: anthropic.id, model: orgs } })
    await prisma.conversation.update({ where: { id: w.conversation.id }, data: { talkingProviderId: anthropic.id, talkingModel: picked } })
    const a = await brief('First job')
    await pump(a.workerSessionId!)
    expect(dispatch.dispatchChatRun.mock.calls[0][4]?.choice?.resolution).toMatchObject({ model: { model: picked }, from: 'conversation' })

    await prisma.conversation.update({ where: { id: w.conversation.id }, data: { talkingModel: later } })
    // The first brief carried on after an approval stays on the model it began on.
    await prisma.operation.update({ where: { id: a.id }, data: { state: 'ACCEPTED' } })
    await dispatchAccepted(a.id, { text: 'Carry on.', hidden: true })
    await handleWorkerRunStatus(frame('run-2', 'COMPLETED'), 'site-1', () => {})
    const b = await brief('Second job')
    await pump(b.workerSessionId!)
    expect(dispatch.dispatchChatRun.mock.calls.map(c => c[3])).toEqual([picked, picked, later])
    expect(openJson<WorkerArgs>(b.args!).modelNote).toBeUndefined()
  })

  it("run on the next allowed model when a list rules the conversation's out where the work is, and its arguments say so @SC-955", async () => {
    const anthropic = await createProvider({ vendor: 'anthropic' })
    await setOrgDefaults({ conversation: { providerId: anthropic.id, model: 'claude-haiku-4-5' } })
    await prisma.conversation.update({ where: { id: w.conversation.id }, data: { talkingProviderId: anthropic.id, talkingModel: 'claude-opus-4-5' } })
    await setList('project', w.project.id, 'every', [{ effect: 'never', pattern: 'anthropic/claude-opus-*' }])
    const op = await brief('Ruled out')
    await pump(op.workerSessionId!)
    expect(dispatch.dispatchChatRun.mock.calls[0][3]).toBe('claude-haiku-4-5')
    const args = openJson<WorkerArgs>((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).args!)
    expect(args.modelNote).toMatch(/^Ran on Claude Haiku 4\.5 · via .+: Claude Opus 4\.5 · via .+ is not allowed for this work\.$/)
  })

  it('wait while one waits for approval, since an answer continues the same session', async () => {
    const first = await brief('First')
    const second = await brief('Second')
    await prisma.operation.update({ where: { id: first.id }, data: { state: 'WAITING_FOR_APPROVAL' } })
    await pump(first.workerSessionId!)
    expect(dispatch.dispatchedChatRuns).toHaveLength(0)
    expect(await state(second.id)).toBe('QUEUED')
  })
})

describe('briefs to two boundaries @SC-960', () => {
  it('run at once, each on its own worker', async () => {
    const shop = await brief('In Shop')
    const own = await brief('In my space', { boundary: 'personal' })
    await pump(shop.workerSessionId!)
    await pump(own.workerSessionId!)
    expect(dispatch.dispatchedChatRuns.map(r => r.sessionId).sort()).toEqual([shop.workerSessionId, own.workerSessionId].sort())
    expect([await state(shop.id), await state(own.id)]).toEqual(['RUNNING', 'RUNNING'])
  })
})

describe("two people's briefs to one boundary @SC-960", () => {
  it("run at once, each on that person's own worker and for that person, never on the other's", async () => {
    const mine = await brief('Mine')
    const other = await createUserWithRole('MEMBER')
    await joinProjectAs(w.project.id, other.id, 'MEMBER')
    const outcome = await tool.run({ ...w.capability, actingUserId: other.id }, { boundary: w.project.key, title: 'Theirs', brief: 'Theirs' }, NEVER_ABORTED)
    const theirs = await prisma.operation.findUniqueOrThrow({ where: { id: (outcome as { operationId: string }).operationId } })
    await pump(mine.workerSessionId!)
    await pump(theirs.workerSessionId!)
    const sent = dispatch.dispatchChatRun.mock.calls.map(([sessionId, input, , , opts]) => [sessionId, input, opts?.senderId])
    expect(sent).toEqual([
      [mine.workerSessionId, 'Mine', w.person.id],
      [theirs.workerSessionId, 'Theirs', other.id],
    ])
    expect([await state(mine.id), await state(theirs.id)]).toEqual(['RUNNING', 'RUNNING'])
  })
})

describe('a brief that cannot start', () => {
  it('fails with why, in words, and the next one starts', async () => {
    const first = await brief('First')
    const second = await brief('Second')
    dispatch.dispatchChatRun.mockRejectedValueOnce(new SiteUnreachableError('Site', 'site-1'))
    await pump(first.workerSessionId!)
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      state: 'FAILED', error: "The site that does the work in Shop can't be reached right now.",
    })
    expect(mailbox.operationEnded).toHaveBeenCalledWith(first.id)
    expect(await state(second.id)).toBe('RUNNING')
  })

  it('takes what the site already did when its run ended before it was recorded', async () => {
    const op = await brief('Quick')
    dispatch.dispatchChatRun.mockImplementationOnce(async (sessionId) => {
      siteStore.addRun('site-1', { id: 'run-fast', sessionId, status: 'COMPLETED', outputText: 'All done.' })
      return { runId: 'run-fast' }
    })
    await pump(op.workerSessionId!)
    const ended = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })
    expect(ended).toMatchObject({ state: 'COMPLETED', runId: 'run-fast' })
  })
})
