/**
 * The conversation the dock opens when nothing is open (desktop shell spec §2), against the real test database: the
 * one the person last wrote in, still active and still theirs to read.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createConversation, createProject, createUserWithRole, joinProjectAs } from '../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getLastWrittenConversation } from '../lastWritten'
import { appendMessage } from '../store/messages'

const ctx = (user: { id: string }) => ({ user })

async function wrote(conversationId: string, authorId: string | null, at: string, role: 'PERSON' | 'AGENT' = 'PERSON') {
  const { message } = await appendMessage({ conversationId, role, authorId, kind: 'TEXT', body: { text: 'hi' } })
  await prisma.conversationMessage.update({ where: { id: message.id }, data: { createdAt: new Date(at) } })
}

describe('the conversation the dock opens', () => {
  it('is the one the person last wrote in, whatever an agent wrote since', async () => {
    const person = await createUserWithRole('MEMBER')
    const first = await createConversation({ openedById: person.id })
    const second = await createConversation({ openedById: person.id })
    await wrote(first.id, person.id, '2026-10-01T10:00:00Z')
    await wrote(second.id, person.id, '2026-10-01T09:00:00Z')
    await wrote(second.id, null, '2026-10-01T11:00:00Z', 'AGENT')

    expect(await getLastWrittenConversation(undefined, ctx(person))).toEqual({ conversationId: first.id })
  })

  it('passes over one archived, closed or no longer theirs to read', async () => {
    const person = await createUserWithRole('MEMBER')
    const project = await createProject()
    await joinProjectAs(project.id, person.id)
    const kept = await createConversation({ openedById: person.id })
    const archived = await createConversation({ openedById: person.id })
    const closed = await createConversation({ openedById: person.id })
    const left = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id })
    await wrote(kept.id, person.id, '2026-10-01T08:00:00Z')
    await wrote(archived.id, person.id, '2026-10-01T09:00:00Z')
    await wrote(closed.id, person.id, '2026-10-01T10:00:00Z')
    await wrote(left.id, person.id, '2026-10-01T11:00:00Z')
    await prisma.conversation.update({ where: { id: archived.id }, data: { status: 'ARCHIVED' } })
    await prisma.conversation.update({ where: { id: closed.id }, data: { status: 'CLOSED', closedReason: 'LEFT_ORGANISATION' } })
    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: person.id } })

    expect(await getLastWrittenConversation(undefined, ctx(person))).toEqual({ conversationId: kept.id })
  })

  it('is none for someone who has written nothing', async () => {
    const person = await createUserWithRole('MEMBER')
    await createConversation({ openedById: person.id })
    expect(await getLastWrittenConversation(undefined, ctx(person))).toBeNull()
  })
})
