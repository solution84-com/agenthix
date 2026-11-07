/** Rename, against the real test database: who may rename, what a title may be, and that the title stays. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { renameConversation } from '../rename'

const ctx = (id: string) => ({ user: { id } })
let personId: string
let otherId: string
let conversationId: string

beforeEach(async () => {
  personId = (await createUserWithRole('MEMBER')).id
  otherId = (await createUserWithRole('MEMBER')).id
  const agent = await createAgent()
  const project = await createProject({ name: 'Shop' })
  await joinProjectAs(project.id, personId, 'MEMBER')
  conversationId = (await prisma.conversation.create({
    data: { home: 'PROJECT', projectId: project.id, openedById: personId, agentId: agent.id, title: 'First words of an answer' } as never,
  })).id
})

const titleOf = async () => (await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).title

describe('renaming a conversation', () => {
  it('gives the conversation the new title, with its spaces tidied', async () => {
    await renameConversation({ conversationId, title: '  Launch   plan ' }, ctx(personId))
    expect(await titleOf()).toBe('Launch plan')
  })

  it('refuses an empty or too long title and changes nothing', async () => {
    await expect(renameConversation({ conversationId, title: '   ' }, ctx(personId))).rejects.toMatchObject({ statusCode: 400 })
    await expect(renameConversation({ conversationId, title: 'x'.repeat(121) }, ctx(personId))).rejects.toMatchObject({ statusCode: 400 })
    expect(await titleOf()).toBe('First words of an answer')
  })

  it('refuses a person who cannot see the conversation, and one who is not signed in', async () => {
    await expect(renameConversation({ conversationId, title: 'Mine now' }, ctx(otherId))).rejects.toMatchObject({ statusCode: 404 })
    await expect(renameConversation({ conversationId, title: 'Mine now' }, {})).rejects.toMatchObject({ statusCode: 401 })
    expect(await titleOf()).toBe('First words of an answer')
  })

  it('refuses a rename of a conversation that is closed', async () => {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'CLOSED' } })
    await expect(renameConversation({ conversationId, title: 'Too late' }, ctx(personId))).rejects.toMatchObject({ statusCode: 409 })
    expect(await titleOf()).toBe('First words of an answer')
  })
})
