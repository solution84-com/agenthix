/**
 * The primary agent (conversational experience spec, Who a person talks to, 3), against the real test database:
 * Kernel until the person chooses another, and again when the chosen one is gone; the agents offered when a
 * conversation starts are the home's, the one it starts with first.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createConversation, createProject, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getConversationAgentChoices, getPrimaryAgent, setPrimaryAgent } from '../primaryAgent'

const ctx = (user: { id: string }) => ({ user })

async function kernel() {
  return createAgent({ name: 'Kernel', handle: 'kernel', isKernel: true })
}

describe('the primary agent @SC-941', () => {
  it('is Kernel by default', async () => {
    const k = await kernel()
    const person = await createUserWithRole('MEMBER')
    expect(await getPrimaryAgent(undefined, ctx(person))).toMatchObject({ agent: { id: k.id, name: 'Kernel' }, isDefault: true })
  })

  it('is the agent the person chose, until they reset it', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const writer = await createAgent({ name: 'Writer' })

    expect(await setPrimaryAgent({ agentId: writer.id }, ctx(person))).toMatchObject({ agent: { id: writer.id }, isDefault: false })
    expect(await getPrimaryAgent(undefined, ctx(person))).toMatchObject({ agent: { id: writer.id }, isDefault: false })
    expect(await setPrimaryAgent({ agentId: null }, ctx(person))).toMatchObject({ agent: { name: 'Kernel' }, isDefault: true })
  })

  it('falls back to Kernel when the chosen agent is gone', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const writer = await createAgent({ name: 'Writer' })
    await setPrimaryAgent({ agentId: writer.id }, ctx(person))
    await prisma.agent.delete({ where: { id: writer.id } })

    expect(await getPrimaryAgent(undefined, ctx(person))).toMatchObject({ agent: { name: 'Kernel' }, isDefault: true })
  })

  it('refuses an agent that does not exist', async () => {
    const person = await createUserWithRole('MEMBER')
    await expect(setPrimaryAgent({ agentId: 'no-such-agent' }, ctx(person))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the agents a conversation may start with @SC-941', () => {
  it("in the person's own space: every agent, the primary first", async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const writer = await createAgent({ name: 'Writer' })
    await createAgent({ name: 'Analyst' })
    await setPrimaryAgent({ agentId: writer.id }, ctx(person))

    const choices = await getConversationAgentChoices({ home: 'PERSON' }, ctx(person))
    expect(choices.map(a => a.name)).toEqual(['Writer', 'Analyst', 'Kernel'])
  })

  it('lifts the agents of the latest conversations — at most three, newest first — above the rest by name', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('MEMBER')
    const [writer, analyst, editor, developer] = await Promise.all(['Writer', 'Analyst', 'Editor', 'Developer'].map(name => createAgent({ name })))
    await createAgent({ name: 'Archivist' })
    const at = (day: number) => new Date(`2026-10-0${day}T09:00:00Z`)
    await createConversation({ openedById: person.id, agentId: developer.id, lastMessageAt: at(1) })
    await createConversation({ openedById: person.id, agentId: editor.id, lastMessageAt: at(2) })
    await createConversation({ openedById: person.id, agentId: analyst.id, lastMessageAt: at(3) })
    await createConversation({ openedById: person.id, agentId: writer.id, lastMessageAt: at(4) })
    await createConversation({ openedById: person.id, agentId: writer.id, lastMessageAt: at(5) })
    await createConversation({ openedById: other.id, agentId: developer.id, lastMessageAt: at(6) })

    const choices = await getConversationAgentChoices({ home: 'PERSON' }, ctx(person))
    expect(choices.map(a => a.name)).toEqual(['Kernel', 'Writer', 'Analyst', 'Editor', 'Archivist', 'Developer'])
  })

  it('says, for each agent, whether voice can start with it, and why not', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    await createAgent({ name: 'Writer', voiceEnabled: true })
    const choices = await getConversationAgentChoices({ home: 'PERSON' }, ctx(person))
    expect(choices.find(a => a.name === 'Kernel')?.voiceRefusal).toContain('has no voice yet')
    expect(choices.find(a => a.name === 'Writer')?.voiceRefusal).toBeTruthy()
  })

  it("offers each agent's role, for the picker's search", async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    await createAgent({ name: 'Writer', role: 'Drafts documents' })
    const choices = await getConversationAgentChoices({ home: 'PERSON' }, ctx(person))
    expect(choices.find(a => a.name === 'Writer')?.role).toBe('Drafts documents')
  })

  it("in a project: its agents only, the primary first when it is one of them, else the project's default", async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const project = await createProject()
    await joinProjectAs(project.id, person.id)
    const [analyst, developer, writer] = await Promise.all(['Analyst', 'Developer', 'Writer'].map(name => createAgent({ name })))
    await prisma.projectAgent.createMany({ data: [analyst, developer].map(a => ({ projectId: project.id, agentId: a.id })) })
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: developer.id } })
    const home = { home: 'PROJECT' as const, projectId: project.id }

    expect((await getConversationAgentChoices(home, ctx(person))).map(a => a.name)).toEqual(['Developer', 'Analyst'])
    await setPrimaryAgent({ agentId: analyst.id }, ctx(person))
    expect((await getConversationAgentChoices(home, ctx(person))).map(a => a.name)).toEqual(['Analyst', 'Developer'])
    await setPrimaryAgent({ agentId: writer.id }, ctx(person))
    expect((await getConversationAgentChoices(home, ctx(person))).map(a => a.name)).toEqual(['Developer', 'Analyst'])
  })

  it("in the person's personal project: every agent", async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const project = await createProject({ personalOwnerId: person.id })
    await createAgent({ name: 'Writer' })
    expect((await getConversationAgentChoices({ home: 'PROJECT', projectId: project.id }, ctx(person))).map(a => a.name))
      .toEqual(['Kernel', 'Writer'])
  })

  it("refuses a project the person is not on", async () => {
    const person = await createUserWithRole('MEMBER')
    const project = await createProject()
    await expect(getConversationAgentChoices({ home: 'PROJECT', projectId: project.id }, ctx(person))).rejects.toMatchObject({ statusCode: 404 })
  })
})
