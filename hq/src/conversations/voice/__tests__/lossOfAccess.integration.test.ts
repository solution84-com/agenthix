/**
 * Voice ends when its holder loses the right to speak where they hold it, against the real test database: made a
 * Viewer, or removed from the project, the change itself ends their voice with the quiet line saying why, and a
 * holder whose right ended cannot add spoken words, invite the agent's hand, or stop a reply.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { removeProjectMember, setProjectMemberRole } from '../../../projects/memberActions'
import { takeVoice } from '../holder'
import { openVoiceSession, resetVoiceSessions, voiceSession } from '../registry'
import type { VoiceSessionDeps } from '../session'
import { ENDED, endVoiceNoLongerAllowed, interruptVoice, inviteVoice, VoiceRefused } from '../service'
import { continueVoice } from '../continue'

type Io = { __wasp_io__?: { fetchSockets(): Promise<never[]> } }

function deps(): VoiceSessionDeps {
  // eslint-disable-next-line require-yield
  async function* synthesize() { return }
  return { synthesize, toHolder: () => undefined, speechFailed: () => undefined, now: () => Date.now() }
}

async function holding() {
  const admin = await createUserWithRole('MEMBER')
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Kernel' })
  const project = await createProject({ name: 'Shop' })
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, person.id, 'MEMBER')
  const conversation = await prisma.conversation.create({
    data: { home: 'PROJECT', projectId: project.id, openedById: person.id, agentId: agent.id },
  })
  await takeVoice(conversation.id, person.id)
  openVoiceSession(conversation.id, person.id, 's1', deps())
  return { admin, person, project, conversation }
}

const holderOf = async (id: string) => (await prisma.conversation.findUniqueOrThrow({ where: { id } })).voiceHolderId
const endedLine = (conversationId: string) =>
  prisma.conversationMessage.findFirst({ where: { conversationId, kind: 'VOICE_ENDED' } })

beforeEach(() => {
  resetVoiceSessions()
  // The socket server is up, with no screen open: the change in access is checked again.
  ;(globalThis as Io).__wasp_io__ = { fetchSockets: async () => [] }
})
afterEach(() => {
  resetVoiceSessions()
  delete (globalThis as Io).__wasp_io__
})

describe('a change in access ends voice', () => {
  it('made a Viewer, the holder loses voice at once, and the record says why', async () => {
    const { admin, person, project, conversation } = await holding()
    await setProjectMemberRole({ projectId: project.id, userId: person.id, role: 'VIEWER' }, { user: { id: admin.id } })
    await vi.waitFor(async () => expect(await holderOf(conversation.id)).toBeNull())
    expect(voiceSession(conversation.id)).toBeUndefined()
    expect((await endedLine(conversation.id))?.body).toMatchObject({ byUserId: person.id, reason: ENDED.noLongerAllowedRecord })
  })

  it('removed from the project, the holder loses voice at once', async () => {
    const { admin, person, project, conversation } = await holding()
    await removeProjectMember({ projectId: project.id, userId: person.id, openTasks: { kind: 'wait' } }, { user: { id: admin.id } })
    await vi.waitFor(async () => expect(await holderOf(conversation.id)).toBeNull())
    expect(voiceSession(conversation.id)).toBeUndefined()
  })

  it('a holder who may still speak keeps voice', async () => {
    const { person, conversation } = await holding()
    await endVoiceNoLongerAllowed([person.id])
    expect(await holderOf(conversation.id)).toBe(person.id)
  })
})

describe('a holder whose right ended cannot steer, even before the change is reported', () => {
  async function demotedQuietly() {
    const held = await holding()
    // Written straight to the row: nothing reports the change, as with a sweep yet to run.
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId: held.project.id, userId: held.person.id } }, data: { role: 'VIEWER' },
    })
    return held
  }

  it('spoken words are not added to their message, and voice ends', async () => {
    const { person, conversation } = await demotedQuietly()
    await expect(continueVoice('s1', person.id, conversation.id, 'turn-1', 'and deploy it')).rejects.toThrow(/Nothing was changed\.$/)
    expect(await prisma.conversationMessage.count({ where: { conversationId: conversation.id, role: 'PERSON' } })).toBe(0)
    expect(await holderOf(conversation.id)).toBeNull()
  })

  it('the raised hand cannot be invited, nor a reply stopped', async () => {
    const { person, conversation } = await demotedQuietly()
    await expect(inviteVoice('s1', person.id, conversation.id, 'card-1')).rejects.toBeInstanceOf(VoiceRefused)
    // Voice has ended, so the next steer is not theirs to make at all.
    await interruptVoice('s1', person.id, conversation.id, 'turn-1', 0)
    expect(voiceSession(conversation.id)).toBeUndefined()
  })
})
