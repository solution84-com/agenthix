/**
 * Integration tests (ADR-0094 — real test DB) for an agent's asset requests (spec part 5, D31): the card is written
 * in the conversation whose work made the run and waits for the person it acts for, whatever the agent's approval
 * mode, Bypassed included; only that person approves it, by their own tap; it runs only if they hold the right then,
 * and is recorded with them as who did it and the agent as who asked. The scheduler and the mailbox are stood in for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { prisma } from '../../../test/db'
import { createAgent, createUserWithRole } from '../../../test/factories'

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

import { requestAssetChange } from '../request'
import { ASSET_REQUEST_TOOL } from '../types'
import { answerRequest } from '../../../conversations/work/toolCalls/answer'
import { sealText } from '../../../conversations/sealing'
import { useTempRoots, writeTextFile, type TempRoots } from '../../../agents/__tests__/definitionFixtures'

const RUN = 'site-run-1'
const SKILL = '---\nname: Code Review\ndescription: Reviews code\n---\n\n# Code Review\n'

let roots: TempRoots
let person: { id: string }
let agent: { id: string }
let conversationId: string
const requester = () => ({ agentId: agent.id, runId: RUN, forUserId: person.id })
const install = { kind: 'install', from: 'shelf', name: 'code-review' }

beforeEach(async () => {
  roots = await useTempRoots()
  await writeTextFile(path.join(roots.assets, 'library/skills/code-review/SKILL.md'), SKILL)
  await prisma.org.create({ data: { name: 'Fernhill' } })
  person = await createUserWithRole('ADMIN')
  // Bypassed: every tool runs, Never included, and no one is asked. An asset request still waits.
  agent = await createAgent({ name: 'Kernel', approval: 'bypassed' })
  const conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
  conversationId = conversation.id
  await prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'w1', state: 'RUNNING',
      title: sealText('Tidy the Library'), authorisedById: person.id, runId: RUN,
    },
  })
})
afterEach(async () => { await roots.restore() })

const answer = (who: string, key: string, how: 'approve' | 'decline' = 'approve') => (operationId: string) => answerRequest({
  conversationId, operationId, answer: how, note: null, answererId: who, via: { kind: 'card', clientMessageId: key },
})

describe('an agent\'s request to install @D31', () => {
  it('waits for the person as a card, though the agent is Bypassed, and installs nothing yet', async () => {
    const { operationId, waitsForPerson } = await requestAssetChange(requester(), install)
    expect(waitsForPerson).toBe(true)
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: operationId } }))
      .toMatchObject({ toolName: ASSET_REQUEST_TOOL, state: 'WAITING_FOR_APPROVAL', authorisedById: person.id })
    expect(await prisma.conversationMessage.count({ where: { conversationId, kind: 'APPROVAL_REQUEST', operationId } })).toBe(1)
    expect(await prisma.asset.count()).toBe(0)
  })

  it('is the same card when asked again while it waits', async () => {
    const first = await requestAssetChange(requester(), install)
    const again = await requestAssetChange(requester(), install)
    expect(again.operationId).toBe(first.operationId)
  })

  it('installs when the person approves it by tap, recorded as theirs and requested by the agent', async () => {
    const { operationId } = await requestAssetChange(requester(), install)
    await answer(person.id, 'c1')(operationId)
    const asset = await prisma.asset.findFirstOrThrow({ include: { currentVersion: true, pinChanges: true } })
    expect(asset.currentVersion).toMatchObject({ byId: person.id, requestedByAgentId: agent.id })
    expect(asset.pinChanges).toMatchObject([{ byId: person.id, requestedByAgentId: agent.id }])
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).state).toBe('COMPLETED')
  })

  it('is answered by no one else, and approved by no one through the agent', async () => {
    const { operationId } = await requestAssetChange(requester(), install)
    const otherAdmin = await createUserWithRole('ADMIN')
    await expect(answer(otherAdmin.id, 'c1')(operationId)).rejects.toMatchObject({ statusCode: 403 })
    const turn = answerRequest({ conversationId, operationId, answer: 'approve', note: null, answererId: person.id, via: { kind: 'turn', turnId: 'turn-x' } })
    await expect(turn).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.asset.count()).toBe(0)
  })

  it('does nothing when the person no longer holds the right at approval', async () => {
    const { operationId } = await requestAssetChange(requester(), install)
    await prisma.userSettings.update({ where: { userId: person.id }, data: { role: 'MEMBER' } })
    await expect(answer(person.id, 'c1')(operationId)).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.asset.count()).toBe(0)
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).state).toBe('FAILED')
  })

  it('does nothing when declined', async () => {
    const { operationId } = await requestAssetChange(requester(), install)
    await answer(person.id, 'c1', 'decline')(operationId)
    expect(await prisma.asset.count()).toBe(0)
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).state).toBe('CANCELLED')
  })
})

describe('what is refused before any card', () => {
  it('a request the person couldn\'t approve, with the policy\'s words', async () => {
    await prisma.userSettings.update({ where: { userId: person.id }, data: { role: 'MEMBER' } })
    await expect(requestAssetChange(requester(), install)).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.operation.count({ where: { toolName: ASSET_REQUEST_TOOL } })).toBe(0)
  })

  it('a kind with no request: trust, settings, naming maintainers', async () => {
    for (const kind of ['trust', 'settings', 'nameMaintainer']) {
      await expect(requestAssetChange(requester(), { kind })).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('a run no conversation started', async () => {
    await expect(requestAssetChange({ ...requester(), runId: 'scheduled-run' }, install)).rejects.toMatchObject({ statusCode: 409 })
  })
})
