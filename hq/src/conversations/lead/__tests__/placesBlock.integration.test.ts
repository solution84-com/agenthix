/**
 * The places the lead is told of every turn, read from the real test database (agent knowledge spec, part 4, P6):
 * from the same re-checked list the tools use, so a place the person lost is no longer named.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { addConversationPlace } from '../../placesOperations'
import { placesForLead, placesTurnBlock } from '../placesBlock'

let person: { id: string }
let agent: { id: string }
let shop: { id: string }

const ctx = (user: { id: string }) => ({ user })

beforeEach(async () => {
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Kernel' })
  shop = await createProject({ name: 'Shop', slug: 'shop' })
  await joinProjectAs(shop.id, person.id, 'MEMBER')
})

describe('the places the lead is told of (P6) @SC-1438', () => {
  it("a project's conversation: the project by its name", async () => {
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: shop.id })
    expect(await placesForLead(conversation.id)).toEqual({
      own: { kind: 'project', projectId: shop.id, name: 'Shop', level: 'shop' },
      added: [],
    })
  })

  it("the person's own conversation: Your space, then a place they added", async () => {
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    await addConversationPlace({ conversationId: conversation.id, place: { kind: 'project', projectId: shop.id } }, ctx(person))
    const places = await placesForLead(conversation.id)
    expect(places).toEqual({
      own: { kind: 'user', name: 'Your space', level: 'personal' },
      added: [{ kind: 'project', projectId: shop.id, name: 'Shop', level: 'shop' }],
    })
    expect(placesTurnBlock(places!)).toContain('- Shop (its pages are named shop:): added by the person')
  })

  it('a place the person lost is no longer named @SC-1437', async () => {
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    await addConversationPlace({ conversationId: conversation.id, place: { kind: 'project', projectId: shop.id } }, ctx(person))
    await prisma.projectMember.deleteMany({ where: { projectId: shop.id, userId: person.id } })
    const places = await placesForLead(conversation.id)
    expect(places?.added).toEqual([])
    expect(placesTurnBlock(places!)).not.toContain('Shop')
  })
})
