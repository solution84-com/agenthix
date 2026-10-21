/**
 * The checks a continuation passes before it goes on, against the real test database (conversation layer spec,
 * Commissioning outside the place: the three are checked again before any continuation turn). They are the one
 * admission rule work is started under, re-run as the person who authorised it, as things stand now, in the
 * boundary the work ran in — not the conversation's place — and the person must still be active and a speaker here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { sealText } from '../../sealing'
import { continuationCheck } from '../continuationChecks'

let person: { id: string }
let agent: { id: string }
let shop: { id: string }
let conversationId: string
let operationId: string

beforeEach(async () => {
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Developer' })
  shop = await createProject({ name: 'Shop' })
  await joinProjectAs(shop.id, person.id, 'MEMBER')
  await prisma.projectAgent.create({ data: { projectId: shop.id, agentId: agent.id } })
  // The person's own conversation, which commissioned work in Shop.
  const conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
  conversationId = conversation.id
  const op = await prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'k', state: 'COMPLETED',
      title: sealText('Profile'), authorisedById: person.id, boundaryType: 'project', boundaryId: shop.id,
    },
  })
  operationId = op.id
})

const passes = () =>
  continuationCheck(conversationId, agent.id)({
    id: 'card', seq: 1, kind: 'RESULT', operationId, operationState: 'COMPLETED', createdAt: new Date(),
    continuation: { authorisedById: person.id, authorisingTurnId: 't', nextStep: 'open a task for each', depth: 1 },
  })

describe('a continuation @SC-963', () => {
  it('goes on while the person, the agent and the tool are all still admitted where the work ran', async () => {
    expect(await passes()).toBe(true)
  })

  it('does not when the person now only reads the boundary', async () => {
    await prisma.projectMember.updateMany({ where: { projectId: shop.id, userId: person.id }, data: { role: 'VIEWER' } })
    expect(await passes()).toBe(false)
  })

  it('does not when the person left the boundary', async () => {
    await prisma.projectMember.deleteMany({ where: { projectId: shop.id, userId: person.id } })
    expect(await passes()).toBe(false)
  })

  it('does not when the agent is no longer assigned there', async () => {
    await prisma.projectAgent.deleteMany({ where: { projectId: shop.id, agentId: agent.id } })
    expect(await passes()).toBe(false)
  })

  it("does not when the boundary's override now sets the tool that started the work to Never", async () => {
    await prisma.agentOverride.create({
      data: { boundaryType: 'project', boundaryId: shop.id, agentId: agent.id, allowedTools: [{ name: 'start_work', state: 'never' }] },
    })
    expect(await passes()).toBe(false)
  })

  it('does not when the person has left the organisation', async () => {
    await prisma.user.update({ where: { id: person.id }, data: { deactivatedAt: new Date() } })
    expect(await passes()).toBe(false)
  })
})
