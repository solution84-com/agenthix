import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolve = vi.hoisted(() => vi.fn())
const credentialOf = vi.hoisted(() => vi.fn())
const list = vi.hoisted(() => vi.fn())
vi.mock('../../routing/resolver', () => ({ resolve, reportCall: vi.fn() }))
vi.mock('../../providers/store', () => ({ providerStore: () => ({ credentialOf, list }) }))

import { failureKind, speechAccess, voiceDownText, voiceNotSetUpText } from '../speechAccess'

const resolved = (vendor: string, voice?: string) => ({
  ok: true, resolution: { purpose: 'tts', basis: 'ESTIMATED', billingProfileId: 'bp-1', vendor, providerName: vendor, model: { providerId: 'p1', model: 'm' }, ...(voice ? { voice } : {}) },
})

beforeEach(() => { resolve.mockReset(); credentialOf.mockReset(); list.mockReset().mockResolvedValue([{ vendor: 'assemblyai' }, { vendor: 'inworld' }]) })

describe('speechAccess @SC-1205 @SC-1835', () => {
  it('resolves the agent’s own speech provider and takes its key from the store', async () => {
    resolve.mockResolvedValue(resolved('inworld', 'Ashley'))
    credentialOf.mockResolvedValue({ key: ' sk-test-fake ', baseUrl: null })
    const answer = await speechAccess('tts', 'agent-1')
    expect(resolve).toHaveBeenCalledWith({ purpose: 'tts', place: { kind: 'organisation' }, agentId: 'agent-1' })
    expect(answer).toEqual({ ok: true, access: { providerId: 'p1', providerName: 'inworld', vendor: 'inworld', model: 'm', voice: 'Ashley', apiKey: 'sk-test-fake',
      costing: { purpose: 'tts', basis: 'ESTIMATED', billingProfileId: 'bp-1', projectId: null, agentId: 'agent-1', userId: null, conversationId: null },
    } })
  })

  it('costs a project’s conversation to its place: the place, the person and the conversation go to the resolver', async () => {
    resolve.mockResolvedValue(resolved('inworld'))
    credentialOf.mockResolvedValue({ key: 'sk-test-fake', baseUrl: null })
    const place = { kind: 'project' as const, projectId: 'proj-1' }
    const answer = await speechAccess('tts', 'agent-1', { place, userId: 'u1', conversationId: 'c1' })
    expect(resolve).toHaveBeenCalledWith({ purpose: 'tts', place, agentId: 'agent-1', userId: 'u1', conversationId: 'c1' })
    expect(answer.ok && answer.access.costing).toMatchObject({ projectId: 'proj-1', userId: 'u1', conversationId: 'c1' })
  })

  it('uses the provider the caller names, as it is: the pick goes to the resolver and its key is read', async () => {
    resolve.mockResolvedValue({ ok: true, resolution: { ...resolved('inworld').resolution, model: { providerId: 'p-named', model: 'inworld-tts-2' } } })
    credentialOf.mockResolvedValue({ key: 'sk-test-fake', baseUrl: null })
    const pick = { providerId: 'p-named', model: 'inworld-tts-2' }
    const answer = await speechAccess('tts', null, { userId: 'u1', pick })
    expect(resolve).toHaveBeenCalledWith({ purpose: 'tts', place: { kind: 'organisation' }, userId: 'u1', pick })
    expect(credentialOf).toHaveBeenCalledWith('p-named')
    expect(answer.ok && answer.access.providerId).toBe('p-named')
  })

  it('says voice is down, and who has been told, when the resolver finds no provider', async () => {
    resolve.mockResolvedValue({ ok: false, problem: { code: 'no_provider' } })
    expect(await speechAccess('stt')).toEqual({
      ok: false, reason: "Voice is down: speech to text isn't working. An organisation admin has been told.",
    })
    expect(voiceDownText('tts')).toBe("Voice is down: text to speech isn't working. An organisation admin has been told.")
  })

  it('says voice is not set up, rather than down, when no provider of the type was ever added @SC-1667', async () => {
    resolve.mockResolvedValue({ ok: false, problem: { code: 'no_provider' } })
    list.mockResolvedValue([{ vendor: 'anthropic' }])
    expect(await speechAccess('stt')).toEqual({ ok: false, reason: voiceNotSetUpText('stt') })
    expect(voiceNotSetUpText('stt')).toBe("Voice isn't set up: no speech to text provider has been added. An organisation admin can add one.")
    // One Inworld provider was added for both: neither is "not set up" once it is there.
    list.mockResolvedValue([{ vendor: 'anthropic' }, { vendor: 'inworld' }])
    expect(await speechAccess('stt')).toEqual({ ok: false, reason: voiceDownText('stt') })
    expect(await speechAccess('tts')).toEqual({ ok: false, reason: voiceDownText('tts') })
  })

  it('hears through Inworld on the key it speaks with', async () => {
    resolve.mockResolvedValue({ ok: true, resolution: { ...resolved('inworld').resolution, purpose: 'stt', model: { providerId: 'p1', model: 'inworld/inworld-stt-1' } } })
    credentialOf.mockResolvedValue({ key: 'sk-test-fake', baseUrl: null })
    const answer = await speechAccess('stt')
    expect(answer.ok && answer.access).toMatchObject({ vendor: 'inworld', model: 'inworld/inworld-stt-1', apiKey: 'sk-test-fake' })
  })

  it('treats a provider of another vendor, or with no key, as down', async () => {
    resolve.mockResolvedValue(resolved('cloud'))
    expect((await speechAccess('stt')).ok).toBe(false)
    resolve.mockResolvedValue(resolved('assemblyai'))
    credentialOf.mockResolvedValue({ key: null, baseUrl: null })
    expect((await speechAccess('stt')).ok).toBe(false)
  })
})

describe('failureKind', () => {
  it('reads the vendor’s status or message', () => {
    expect(failureKind(401)).toBe('auth')
    expect(failureKind(402)).toBe('quota')
    expect(failureKind(null, 'Inworld TTS failed: 429 Too Many')).toBe('rate-limit')
    expect(failureKind(503)).toBe('unavailable')
  })
})
