/**
 * The talking model fixed once, and the switch to the offered access on the person's say, recorded in the thread
 * (model access and policy spec), against the real test database. The record's appendMessage is the store's seam,
 * given here as a recorder.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { fixTalkingAccess, switchToOfferedAccess } from '../talkingModelSwitch'
import { resolveConversationAccess } from '../conversationAccess'
import type { AppendMessage, AppendMessageInput, ConversationHomeRef, ResolvedAccess } from '../../contract'
import { createAgent, createUser } from '../../../test/factories'
import { storeKey, orgKey } from '../../../model-access/__tests__/runCredentialFixtures'

const SONNET = 'claude-sonnet-5'
const GPT = 'openai/gpt-4.1'

let home: ConversationHomeRef
let appended: AppendMessageInput[]
const appendMessage: AppendMessage = async (input) => {
  appended.push(input)
  return { message: {} as never, duplicate: false }
}

const anthropic: ResolvedAccess = { provider: 'anthropic', model: SONNET, apiKey: 'k', owner: 'user', kind: 'API_KEY' }

beforeEach(async () => {
  appended = []
  const person = await createUser()
  const agent = await createAgent({ defaultModel: SONNET, runtime: 'claude-sdk' })
  const conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
  home = { id: conversation.id, home: 'PERSON', projectId: null, taskId: null, openedById: person.id, agentId: agent.id }
  await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: person.id, talking: SONNET, allowed: [SONNET, GPT] } })
})

const talking = () => prisma.conversation.findUniqueOrThrow({
  where: { id: home.id },
  select: { talkingModel: true, talkingProvider: true, accessOwnerType: true, accessKind: true },
})

describe('fixing the talking model @SC-951', () => {
  it('fixes it once and keeps it', async () => {
    expect(await fixTalkingAccess(home.id, anthropic)).toBe(true)
    expect(await fixTalkingAccess(home.id, { ...anthropic, provider: 'openai', model: GPT })).toBe(false)
    expect(await talking()).toEqual({ talkingModel: SONNET, talkingProvider: 'anthropic', accessOwnerType: 'user', accessKind: 'API_KEY' })
  })
})

describe('switching to the offered access @SC-952', () => {
  it('is refused before a talking model is fixed', async () => {
    await expect(switchToOfferedAccess(home, home.openedById, appendMessage)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('is refused while the access it talks on is still usable', async () => {
    await fixTalkingAccess(home.id, anthropic)
    await storeKey('user', home.openedById, 'mine')
    await orgKey('openai', 'org-openai')
    await expect(switchToOfferedAccess(home, home.openedById, appendMessage)).rejects.toMatchObject({ statusCode: 409 })
    expect(appended).toEqual([])
  })

  it('is refused when there is nothing to move to', async () => {
    await fixTalkingAccess(home.id, anthropic)
    await expect(switchToOfferedAccess(home, home.openedById, appendMessage)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('moves to the offer, records the switch once, and a second switch is refused', async () => {
    await fixTalkingAccess(home.id, anthropic)
    await orgKey('openai', 'org-openai')

    const offer = await switchToOfferedAccess(home, home.openedById, appendMessage)

    expect(offer).toMatchObject({ provider: 'openai', model: GPT, owner: 'org' })
    expect(await talking()).toEqual({ talkingModel: GPT, talkingProvider: 'openai', accessOwnerType: 'org', accessKind: 'API_KEY' })
    expect(appended).toEqual([{
      conversationId: home.id,
      role: 'PLATFORM',
      kind: 'NOTICE',
      authorId: home.openedById,
      body: { text: "This conversation moved from Claude Sonnet 5 to GPT-4.1, on the organisation's OpenAI key." },
    }])
    // Now on OpenAI, which is usable, so there is nothing to switch from.
    await expect(switchToOfferedAccess(home, home.openedById, appendMessage)).rejects.toMatchObject({ statusCode: 409 })
    expect(appended).toHaveLength(1)
  })

  it('moves off a key the provider refused, though it is still stored, onto the next payer of the same model', async () => {
    await fixTalkingAccess(home.id, anthropic)
    await storeKey('user', home.openedById, 'mine')
    await orgKey('anthropic', 'org-anthropic')

    const offer = await switchToOfferedAccess(home, home.openedById, appendMessage, { owner: 'user', provider: 'anthropic' })

    expect(offer).toMatchObject({ provider: 'anthropic', model: SONNET, owner: 'org' })
    expect(await talking()).toEqual({ talkingModel: SONNET, talkingProvider: 'anthropic', accessOwnerType: 'org', accessKind: 'API_KEY' })
    expect(appended[0]!.body).toEqual({ text: "This conversation now talks on the organisation's Anthropic key." })
    // Without the refusal the key it now talks on is usable: nothing to switch from.
    await expect(switchToOfferedAccess(home, home.openedById, appendMessage)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('never returns to a refused key afterwards, even when the key it moved to is gone', async () => {
    await fixTalkingAccess(home.id, anthropic)
    await storeKey('user', home.openedById, 'mine')
    await orgKey('anthropic', 'org-anthropic')
    await switchToOfferedAccess(home, home.openedById, appendMessage, { owner: 'user', provider: 'anthropic' })

    const fixed = { model: SONNET, provider: 'anthropic' as const, owner: 'org' as const }
    expect((await resolveConversationAccess(home, fixed)).access).toMatchObject({ owner: 'org', apiKey: 'org-anthropic' })

    await prisma.provider.deleteMany({})
    const result = await resolveConversationAccess(home, fixed)
    expect(result.access).toBeNull()
    expect(result.offer).toBeNull()
  })
})
