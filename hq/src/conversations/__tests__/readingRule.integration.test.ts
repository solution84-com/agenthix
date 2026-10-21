/**
 * Who may read a conversation and who may speak in it (conversational experience spec, Where a conversation's
 * record lives), against the real test database: a person's or project's conversation is its opener's alone,
 * for every role; a project's needs them still on it; a closed one is read, not spoken in.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createConversation, createProject, createTestTask, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { requireConversationReader, requireConversationSpeaker } from '../readingRule'

async function projectConversation(role: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject()
  await joinProjectAs(project.id, person.id, role)
  const conversation = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id })
  return { person, project, conversation }
}

describe("a person's own conversation @SC-942", () => {
  it('is read and spoken in by the person who opened it', async () => {
    const conversation = await createConversation()
    await expect(requireConversationReader(conversation.id, conversation.openedById)).resolves.toMatchObject({ id: conversation.id, home: 'PERSON' })
    await expect(requireConversationSpeaker(conversation.id, conversation.openedById)).resolves.toMatchObject({ id: conversation.id })
  })

  it('does not exist for anyone else, an organisation admin included', async () => {
    const conversation = await createConversation()
    const admin = await createUserWithRole('ADMIN')
    await expect(requireConversationReader(conversation.id, admin.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(requireConversationSpeaker(conversation.id, admin.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers a missing conversation the same way', async () => {
    const person = await createUserWithRole('MEMBER')
    await expect(requireConversationReader('no-such-conversation', person.id)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("a project's conversation @SC-942", () => {
  it("is its opener's while they are on the project", async () => {
    const { person, conversation } = await projectConversation()
    await expect(requireConversationSpeaker(conversation.id, person.id)).resolves.toMatchObject({ home: 'PROJECT' })
  })

  it("is not another member's, nor the project admin's", async () => {
    const { project, conversation } = await projectConversation()
    const projectAdmin = await createUserWithRole('MEMBER')
    await joinProjectAs(project.id, projectAdmin.id, 'ADMIN')
    await expect(requireConversationReader(conversation.id, projectAdmin.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('does not exist for its opener once they have left the project', async () => {
    const { person, project, conversation } = await projectConversation()
    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: person.id } })
    await expect(requireConversationReader(conversation.id, person.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('is read and not spoken in by its opener once they are a Viewer there', async () => {
    const { person, conversation } = await projectConversation('VIEWER')
    await expect(requireConversationReader(conversation.id, person.id)).resolves.toMatchObject({ id: conversation.id })
    await expect(requireConversationSpeaker(conversation.id, person.id)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('a closed conversation @SC-943', () => {
  it('is read and not spoken in, and says why', async () => {
    const conversation = await createConversation({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
    await expect(requireConversationReader(conversation.id, conversation.openedById)).resolves.toMatchObject({ id: conversation.id })
    await expect(requireConversationSpeaker(conversation.id, conversation.openedById))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('no longer a member of its project') })
  })

  it('an archived one is still spoken in', async () => {
    const conversation = await createConversation({ status: 'ARCHIVED' })
    await expect(requireConversationSpeaker(conversation.id, conversation.openedById)).resolves.toMatchObject({ id: conversation.id })
  })
})

describe('a project conversation closed with its project @SC-943', () => {
  it('is still read by its opener after they left the project, never spoken in, and not anyone else\'s', async () => {
    const { person, project, conversation } = await projectConversation()
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'CLOSED', closedReason: 'LEFT_PROJECT' } })
    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: person.id } })
    const other = await createUserWithRole('ADMIN')

    await expect(requireConversationReader(conversation.id, person.id)).resolves.toMatchObject({ id: conversation.id })
    await expect(requireConversationSpeaker(conversation.id, person.id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(requireConversationReader(conversation.id, other.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('is still read by its opener once the project is gone, and never spoken in', async () => {
    const { person, project, conversation } = await projectConversation()
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'CLOSED', closedReason: 'PROJECT_DELETED' } })
    await prisma.projectMember.deleteMany({ where: { projectId: project.id } })
    await prisma.board.deleteMany({ where: { projectId: project.id } })
    await prisma.project.delete({ where: { id: project.id } })

    await expect(requireConversationReader(conversation.id, person.id)).resolves.toMatchObject({ id: conversation.id })
    await expect(requireConversationSpeaker(conversation.id, person.id))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('its project was deleted') })
  })

  it('closed for another reason, is not read by someone no longer on the project', async () => {
    const { person, project, conversation } = await projectConversation()
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'CLOSED', closedReason: 'LEFT_ORGANISATION' } })
    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: person.id } })
    await expect(requireConversationReader(conversation.id, person.id)).rejects.toMatchObject({ statusCode: 404 })
  })
})
