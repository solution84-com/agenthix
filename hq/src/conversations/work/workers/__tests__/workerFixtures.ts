/**
 * What the workers' integration tests stand on: a person who works in a project that the conversation's agent is
 * assigned to, the person's own conversation with that agent, and a turn answering the person in it. The test file
 * mocks `wasp/server`, the site and dispatch fakes, and the mailbox, before importing this.
 */
import { vi } from 'vitest'
import { prisma } from '../../../../test/db'
import { createAgent, createProject, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../../../test/factories'
import { turnCapability } from '../../../../server/controlplane/__tests__/turnFixtures'
import type { Mailbox, TurnCapability } from '../../../contract'

export interface World {
  person: { id: string }
  agent: { id: string; name: string }
  project: { id: string; key: string; name: string }
  conversation: { id: string }
  capability: TurnCapability
}

export async function world(): Promise<World> {
  await ensureExecutionSite()
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Developer' })
  const project = await createProject({ name: 'Shop' })
  await joinProjectAs(project.id, person.id, 'MEMBER')
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  const conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
  const capability = turnCapability({ conversationId: conversation.id, agentId: agent.id, actingUserId: person.id, trigger: 'MESSAGE' })
  return { person, agent, project, conversation, capability }
}

/** The mailbox the tests stand in for: it records, and the real settleOperation calls it. */
export function spyMailbox() {
  return {
    operationSettled: vi.fn<Mailbox['operationSettled']>(),
    operationEnded: vi.fn<Mailbox['operationEnded']>(async () => {}),
    approvalRequested: vi.fn<Mailbox['approvalRequested']>(async () => {}),
  } satisfies Mailbox
}

export const NEVER_ABORTED = { signal: new AbortController().signal }

/** What a dispatched brief asked, without the opening that goes before every brief. */
export const briefOf = (inputText: string): string => inputText.slice(inputText.lastIndexOf('\n\n') + 2)
