/**
 * The plain checks, the reviewer and the approval card against the real test database: a proposal stores its flags,
 * summary and card rule; the reviewer's answer is stored; the card is written in the conversation whose run
 * proposed; only the place's administrators answer it; Approve from the card goes through the library's approval
 * with the hash the card showed; a decline only takes the card away. The model, the scheduler and the mailbox are
 * stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../conversations/coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../../conversations/coordinator/mailbox', async () => {
  const { spyMailbox } = await import('../../../conversations/work/workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../../../conversations/work/settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import type { WorkflowReadFilesResult } from '@agenthix/core'
import { readProposal } from '../../proposalContent'
import { storeVersion } from '../../propose'
import { reviewAndPresent } from '../afterProposal'
import { writeWorkflowCard } from '../card'
import { WORKFLOW_APPROVAL_TOOL } from '../cardTool'
import { answerRequest } from '../../../conversations/work/toolCalls/answer'
import { sealText } from '../../../conversations/sealing'
import type { WorkflowPlace } from '../../placeAccess'

const DIGEST = `sha256:${'1'.repeat(64)}`
const RUN = 'site-run-1'

let place: WorkflowPlace
let admin: { id: string }
let member: { id: string }
let conversationId: string
let agent: { id: string }

beforeEach(async () => {
  const project = await createProject()
  admin = await createUser()
  member = await createUser()
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, member.id, 'MEMBER')
  place = { type: 'project', id: project.id }
  agent = await createAgent({ name: 'Kernel' })
  const conversation = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: project.id, openedById: member.id, agentId: agent.id } })
  conversationId = conversation.id
  // The worker whose run proposes: its operation names the site's run.
  await prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'w1', state: 'RUNNING',
      title: sealText('Deploy'), authorisedById: member.id, boundaryType: 'project', boundaryId: project.id, runId: RUN,
    },
  })
})

async function propose(definition: Record<string, unknown>) {
  const sites = {
    async readFiles(): Promise<WorkflowReadFilesResult> {
      return { ok: true, files: [{ path: 'workflow.yaml', contentBase64: Buffer.from(JSON.stringify(definition)).toString('base64'), executable: false }] }
    },
  }
  const read = await readProposal('site', { ownerType: place.type, ownerId: place.id, workspaceId: null }, 'workflow.yaml', {
    sites, readYaml: (t) => ({ ok: true, data: JSON.parse(t) }),
    secretNames: async () => ['KEY'], variableNames: async () => [], executorImageDigest: DIGEST,
  })
  if (!read.ok) throw new Error(read.message)
  const followed: string[] = []
  const result = await storeVersion(place, read.proposal, { kind: 'agent', agentId: agent.id, agentRunId: RUN, onBehalfOfUserId: member.id }, (id) => { followed.push(id) })
  return { result, versionId: followed[0]! }
}

const model = (text: string) => async () => ({ model: { ask: async () => text } })
const LOW = '{"level":"low","points":[]}'

async function presented(versionId: string, answer = LOW) {
  await reviewAndPresent(versionId, { model: model(answer), writeCard: writeWorkflowCard })
  return prisma.operation.findFirstOrThrow({ where: { conversationId, toolName: WORKFLOW_APPROVAL_TOOL } })
}

describe('at proposal', () => {
  it('stores the plain checks\' flags, summary and card rule, and answers the flags', async () => {
    const { result, versionId } = await propose({ name: 'deploy', steps: [{ name: 'Go', run: 'rm -rf build && ls /run/secrets/KEY', secrets: ['KEY'] }] })
    const v = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(result.flags.map((f) => f.rule)).toEqual([7])
    expect(v.checkFlags).toEqual(result.flags)
    expect(v.checkSummary).toBe('New workflow deploy: 1 step; secrets KEY.')
    expect(v.cardMayApprove).toBe(false)
  })
})

describe('the reviewer and the card', () => {
  it('stores the reviewer\'s level and writes the card in the proposing run\'s conversation', async () => {
    const { versionId } = await propose({ name: 'tidy', steps: [{ name: 'Go', run: 'ls' }] })
    const op = await presented(versionId)
    const v = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(v.reviewLevel).toBe('LOW')
    expect(v.reviewedAt).not.toBeNull()
    expect(op).toMatchObject({ state: 'WAITING_FOR_APPROVAL', boundaryType: 'project', boundaryId: place.id })
    const card = await prisma.conversationMessage.findFirstOrThrow({ where: { conversationId, kind: 'APPROVAL_REQUEST', operationId: op.id } })
    expect(card).toBeTruthy()
  })

  it('lets only an administrator approve, from the card, the version it showed', async () => {
    const { versionId } = await propose({ name: 'tidy', steps: [{ name: 'Go', run: 'ls' }] })
    const op = await presented(versionId)
    const answer = (who: string, key: string) => answerRequest({
      conversationId, operationId: op.id, answer: 'approve', note: null, answererId: who, via: { kind: 'card', clientMessageId: key },
    })
    await expect(answer(member.id, 'a1')).rejects.toMatchObject({ statusCode: 403 })
    await answer(admin.id, 'a2')
    const v = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(v.state).toBe('APPROVED')
    expect(await prisma.workflowApproval.findFirst({ where: { versionId, approvedById: admin.id } })).not.toBeNull()
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).state).toBe('COMPLETED')
  })

  it('refuses Approve from the card when the plain checks ask for the full review, and a decline leaves the version waiting', async () => {
    const { versionId } = await propose({ name: 'deploy', steps: [{ name: 'Go', run: 'ls /run/secrets/KEY', secrets: ['KEY'] }] })
    const op = await presented(versionId)
    await expect(answerRequest({
      conversationId, operationId: op.id, answer: 'approve', note: null, answererId: admin.id, via: { kind: 'card', clientMessageId: 'b1' },
    })).rejects.toMatchObject({ statusCode: 409 })
    await answerRequest({ conversationId, operationId: op.id, answer: 'decline', note: null, answererId: admin.id, via: { kind: 'card', clientMessageId: 'b2' } })
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: versionId } })).state).toBe('PROPOSED')
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).state).toBe('CANCELLED')
  })

  it('writes no card for a proposal no conversation\'s run made', async () => {
    await prisma.operation.updateMany({ where: { runId: RUN }, data: { runId: null } })
    const { versionId } = await propose({ name: 'tidy', steps: [{ name: 'Go', run: 'ls' }] })
    await reviewAndPresent(versionId, { model: model(LOW), writeCard: writeWorkflowCard })
    expect(await prisma.operation.count({ where: { toolName: WORKFLOW_APPROVAL_TOOL } })).toBe(0)
  })
})
