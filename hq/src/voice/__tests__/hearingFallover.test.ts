import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const speechAccess = vi.hoisted(() => vi.fn())
const list = vi.hoisted(() => vi.fn())
const reportCall = vi.hoisted(() => vi.fn())
vi.mock('wasp/server', () => ({ HttpError: class extends Error { constructor(public statusCode: number, m: string) { super(m) } } }))
vi.mock('../../routing/resolver', () => ({ reportCall }))
vi.mock('../speechAccess', async (importOriginal) => ({ ...(await importOriginal<typeof import('../speechAccess')>()), speechAccess }))
vi.mock('../../providers/store', () => ({ providerStore: () => ({ list }) }))
vi.mock('../../conversations/readingRule', () => ({ requireConversationSpeaker: vi.fn() }))

import { getSpeechToken } from '../speechTokenAction'
import { hearingWays, hearsOf } from '../hearingAccess'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

const IW_KEY = 'inworld-key-that-speaks-and-hears-0001'
const costing = { purpose: 'stt', basis: 'ESTIMATED', billingProfileId: 'bp', projectId: null, agentId: null, userId: 'u1', conversationId: null }
const iw = { providerId: 'p-iw', providerName: 'Inworld', vendor: 'inworld', model: 'inworld/inworld-stt-1', voice: null, apiKey: IW_KEY, costing }
const aai = { providerId: 'p-aai', providerName: 'AssemblyAI', vendor: 'assemblyai', model: 'universal-3-6-pro', voice: null, apiKey: 'aai-key', costing }
const rows = [
  { id: 'p-aai', vendor: 'assemblyai', state: 'works' },
  { id: 'p-iw', vendor: 'inworld', state: 'works' },
  { id: 'p-ant', vendor: 'anthropic', state: 'works' },
]
const ctx = { user: { id: 'u1' }, entities: {} } as never

/** The resolver answers Inworld; a pick of another provider answers that one. */
function resolverGives(first: typeof iw | typeof aai) {
  speechAccess.mockImplementation(async (_kind: string, _agent: unknown, scope: { pick?: { providerId: string; model: string } }) => {
    if (!scope.pick) return { ok: true, access: first }
    const picked = [iw, aai].find(a => a.providerId === scope.pick!.providerId)
    return picked ? { ok: true, access: { ...picked, model: scope.pick.model } } : { ok: false, reason: 'no' }
  })
}

const iwToken = { ok: true, status: 200, json: async () => ({ accessToken: 'iw-one-time' }), text: async () => '' }
const aaiToken = { ok: true, status: 200, json: async () => ({ token: 'aai-token', expires_in_seconds: 600 }), text: async () => '' }
const refused = { ok: false, status: 401, json: async () => ({}), text: async () => 'invalid key' }

const originalFetch = global.fetch
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue(rows); resolverGives(iw) })
afterEach(() => { global.fetch = originalFetch })

describe('which services a client hears with @SC-1835', () => {
  it('reads the services the client names, in hq’s order; none named, or none known, is AssemblyAI alone', () => {
    expect(hearsOf(['assemblyai', 'inworld'])).toEqual(['inworld', 'assemblyai'])
    expect(hearsOf(undefined)).toEqual(['assemblyai'])
    expect(hearsOf(['deepgram', 3])).toEqual(['assemblyai'])
  })

  it('tries the resolver’s answer first, then the other listening provider that works', async () => {
    const answer = await hearingWays(null, { userId: 'u1' }, ['inworld', 'assemblyai'])
    expect(answer.ok && answer.ways.map(w => w.providerId)).toEqual(['p-iw', 'p-aai'])
    expect(speechAccess).toHaveBeenLastCalledWith('stt', null, { userId: 'u1', pick: { providerId: 'p-aai', model: 'universal-3-6-pro' } })
  })

  it('gives a client that cannot stream to Inworld the AssemblyAI provider instead', async () => {
    const answer = await hearingWays(null, {}, ['assemblyai'])
    expect(answer.ok && answer.ways.map(w => w.vendor)).toEqual(['assemblyai'])
  })

  it('says listening needs AssemblyAI when Inworld is the only one, for a client that cannot use it', async () => {
    list.mockResolvedValue([rows[1]])
    expect(await hearingWays(null, {}, ['assemblyai'])).toEqual({ ok: false, reason: "Listening here needs AssemblyAI, which isn't set up. An organisation admin can add it." })
  })

  it('leaves out a provider that is not working, and uses a named provider as it is', async () => {
    list.mockResolvedValue([{ ...rows[0], state: 'unreachable' }, rows[1]])
    const answer = await hearingWays(null, {}, ['inworld', 'assemblyai'])
    expect(answer.ok && answer.ways.map(w => w.vendor)).toEqual(['inworld'])
    const named = await hearingWays(null, { pick: { providerId: 'p-iw', model: 'inworld/inworld-stt-1' } }, ['inworld', 'assemblyai'])
    expect(named.ok && named.ways).toHaveLength(1)
  })
})

describe('getSpeechToken through either way of hearing @SC-1835', () => {
  it('mints Inworld’s token for a client that hears with it, and returns the token, never the key', async () => {
    global.fetch = vi.fn().mockResolvedValue(iwToken) as never
    const token = await getSpeechToken({ hears: ['inworld', 'assemblyai'] }, ctx)
    expect(token).toMatchObject({ provider: 'inworld', token: 'iw-one-time', config: { modelId: 'inworld/inworld-stt-1' } })
    expect(typeof token.ticket).toBe('string')
    expect(JSON.stringify(token)).not.toContain(IW_KEY)
    expect(reportCall).toHaveBeenCalledWith('p-iw', null)
  })

  it('falls to AssemblyAI when Inworld’s mint fails, and reports the failure to Inworld’s health', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(refused).mockResolvedValueOnce(aaiToken) as never
    const token = await getSpeechToken({ hears: ['inworld', 'assemblyai'] }, ctx)
    expect(token).toMatchObject({ provider: 'assemblyai', token: 'aai-token', config: { speech_model: 'universal-3-6-pro' } })
    expect(reportCall).toHaveBeenCalledWith('p-iw', 'auth', 'invalid key')
    expect(reportCall).toHaveBeenCalledWith('p-aai', null)
  })

  it('falls to Inworld when AssemblyAI, the organisation’s choice, cannot mint', async () => {
    resolverGives(aai)
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(iwToken) as never
    const token = await getSpeechToken({ hears: ['inworld', 'assemblyai'] }, ctx)
    expect(token.provider).toBe('inworld')
    expect(reportCall).toHaveBeenCalledWith('p-aai', 'unavailable', 'ECONNRESET')
  })

  it('refuses with the last failure when no way of hearing can mint (502)', async () => {
    global.fetch = vi.fn().mockResolvedValue(refused) as never
    await expect(getSpeechToken({ hears: ['inworld', 'assemblyai'] }, ctx)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('AssemblyAI rejected token request (401)') })
  })

  it('gives a caller that names no service (dictation, the mobile app) AssemblyAI, though Inworld is the default', async () => {
    global.fetch = vi.fn().mockResolvedValue(aaiToken) as never
    const token = await getSpeechToken(undefined, ctx)
    expect(token.provider).toBe('assemblyai')
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])).toEqual(['https://streaming.assemblyai.com/v3/token?expires_in_seconds=600'])
  })
})
