import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolve = vi.hoisted(() => vi.fn())
const credentialOf = vi.hoisted(() => vi.fn())
vi.mock('../../routing/resolver', () => ({ resolve, reportCall: vi.fn() }))
vi.mock('../../providers/store', () => ({ providerStore: () => ({ credentialOf }) }))

import { failureKind, speechAccess, voiceDownText } from '../speechAccess'

const resolved = (vendor: string, voice?: string) => ({
  ok: true, resolution: { vendor, providerName: vendor, model: { providerId: 'p1', model: 'm' }, ...(voice ? { voice } : {}) },
})

beforeEach(() => { resolve.mockReset(); credentialOf.mockReset() })

describe('speechAccess', () => {
  it('resolves the agent’s own speech provider and takes its key from the store', async () => {
    resolve.mockResolvedValue(resolved('inworld', 'Ashley'))
    credentialOf.mockResolvedValue({ key: ' sk-test-fake ', baseUrl: null })
    const answer = await speechAccess('tts', 'agent-1')
    expect(resolve).toHaveBeenCalledWith({ purpose: 'tts', place: { kind: 'organisation' }, agentId: 'agent-1' })
    expect(answer).toEqual({ ok: true, access: { providerId: 'p1', providerName: 'inworld', vendor: 'inworld', model: 'm', voice: 'Ashley', apiKey: 'sk-test-fake' } })
  })

  it('says voice is down, and who has been told, when the resolver finds no provider', async () => {
    resolve.mockResolvedValue({ ok: false, problem: { code: 'no_provider' } })
    expect(await speechAccess('stt')).toEqual({
      ok: false, reason: "Voice is down: speech to text isn't working. An organisation admin has been told.",
    })
    expect(voiceDownText('tts')).toBe("Voice is down: text to speech isn't working. An organisation admin has been told.")
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
