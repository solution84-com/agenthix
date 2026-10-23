import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const speechAccess = vi.hoisted(() => vi.fn())
const requireSpeaker = vi.hoisted(() => vi.fn())
const placeOfConversation = vi.hoisted(() => vi.fn())
vi.mock('wasp/server', () => ({ HttpError: class extends Error { constructor(public statusCode: number, m: string) { super(m) } } }))
vi.mock('../../routing/resolver', () => ({ reportCall: vi.fn() }))
vi.mock('../speechAccess', async (importOriginal) => ({ ...(await importOriginal<typeof import('../speechAccess')>()), speechAccess }))
vi.mock('../../conversations/readingRule', () => ({ requireConversationSpeaker: requireSpeaker }))
vi.mock('../../routing/place', () => ({ placeOfConversation }))

import { getSpeechToken } from '../speechTokenAction'
import { sttSessionRow } from '../../billing/sources/voice'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')

const costing = { purpose: 'stt', basis: 'ESTIMATED', billingProfileId: 'bp-project', projectId: 'p1', agentId: 'a1', userId: 'u1', conversationId: 'c1' }
const access = { providerId: 'prov', providerName: 'Speech', vendor: 'assemblyai', model: 'm', voice: null, apiKey: 'stt-key', costing }
const ctx = { user: { id: 'u1' }, entities: {} } as never

describe('getSpeechToken ticket and place', () => {
  const originalFetch = global.fetch
  beforeEach(() => {
    vi.clearAllMocks()
    requireSpeaker.mockResolvedValue({ id: 'c1', home: 'PROJECT', projectId: 'p1', taskId: null, openedById: 'u1', agentId: 'a1' })
    placeOfConversation.mockResolvedValue({ kind: 'project', projectId: 'p1' })
    speechAccess.mockResolvedValue({ ok: true, access })
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't', expires_in_seconds: 600 }) }) as never
  })
  afterEach(() => { global.fetch = originalFetch })

  it('seals a ticket that comes back as the session’s ledger row, costed to the token’s profile and project', async () => {
    const token = await getSpeechToken({ agentId: 'a1', conversationId: 'c1' }, ctx)
    expect(token.token).toBe('t')
    const row = sttSessionRow(token.ticket, 'u1', 60_000, new Date(Date.now() + 90_000))
    expect(row).toMatchObject({ ok: true, row: { purpose: 'stt', billingProfileId: 'bp-project', projectId: 'p1', conversationId: 'c1', userId: 'u1', usage: { audioMs: 60_000 } } })
  })

  it('asks for speech in the conversation’s place, for a person who may speak there', async () => {
    const ref = { id: 'c1', home: 'PROJECT', projectId: 'p1', taskId: null, openedById: 'u2', agentId: 'a1' }
    requireSpeaker.mockResolvedValue(ref)
    placeOfConversation.mockResolvedValue({ kind: 'project', projectId: 'p1' })
    await getSpeechToken({ agentId: 'a1', conversationId: 'c1' }, ctx)
    expect(requireSpeaker).toHaveBeenCalledWith('c1', 'u1')
    expect(speechAccess).toHaveBeenCalledWith('stt', 'a1', { place: { kind: 'project', projectId: 'p1' }, userId: 'u1', conversationId: 'c1' })
  })

  it('refuses a conversation the person may not speak in, and makes no token', async () => {
    requireSpeaker.mockRejectedValue(new Error('no'))
    await expect(getSpeechToken({ conversationId: 'c9' }, ctx)).rejects.toThrow('no')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('without a conversation is costed to the organisation, for the person', async () => {
    await getSpeechToken(undefined, ctx)
    expect(speechAccess).toHaveBeenCalledWith('stt', undefined, { userId: 'u1' })
  })

  it('refuses a ticket opened by someone else', async () => {
    const token = await getSpeechToken(undefined, ctx)
    expect(sttSessionRow(token.ticket, 'u2', 1000, new Date())).toMatchObject({ ok: false })
  })
})
