import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// hq's setup state is derived from its data and never stored (setup spec); models and voice may be left for later (ADR-0160).

const db = vi.hoisted(() => ({
  org: { setupCompletedAt: null as Date | null },
  firstAdmin: true,
  role: 'ADMIN',
  updated: 0,
  written: [] as Record<string, unknown>[],
}))

vi.mock('wasp/server', async () => {
  class HttpError extends Error {
    constructor(public statusCode: number, message?: string) { super(message) }
  }
  return {
    HttpError,
    prisma: {
      org: {
        findFirst: async () => db.org,
        updateMany: async () => { db.updated += 1; return { count: 1 } },
        update: async (a: { data: Record<string, unknown> }) => { db.written.push(a.data); return {} },
      },
      invite: { findFirst: async () => (db.firstAdmin ? { id: 'i' } : null) },
      userSettings: { findUnique: async () => ({ role: db.role }) },
    },
  }
})

import { claimStateOf, finishSetup, setupResumeStep } from '../setupState'
import { useProviderStore } from '../../providers/store'
import { FakeProviderStore } from '../../providers/__tests__/fakeProviderStore'
import type { NewProvider } from '../../providers/store'

const provider = (vendor: NewProvider['vendor'], state: NewProvider['state'] = 'works'): NewProvider => ({
  name: vendor, vendor, credentialKind: 'api_key', baseUrl: null, keyHint: 'fake', state, stateDetail: null,
  secret: null, lastCheckedAt: null, lastWorkedAt: null,
})

describe('claimStateOf @SC-709 @SC-1182', () => {
  it('is unclaimed with no user, setting up with a first account, set up once setup is recorded', () => {
    expect(claimStateOf({ users: 0, setupCompletedAt: null })).toBe('unclaimed')
    expect(claimStateOf({ users: 1, setupCompletedAt: null })).toBe('setting_up')
    expect(claimStateOf({ users: 3, setupCompletedAt: new Date() })).toBe('set_up')
  })
})

describe('setupResumeStep @SC-709 @SC-1182', () => {
  const p = (vendor: NewProvider['vendor'], state: NewProvider['state'] = 'works') => ({ vendor, state })

  it('opens at the organisation until its step is saved, whatever the providers', () => {
    expect(setupResumeStep(false, [])).toBe('organisation')
    expect(setupResumeStep(false, [p('anthropic'), p('assemblyai'), p('inworld')])).toBe('organisation')
  })

  it('then at the AI choice while no provider is added', () => {
    expect(setupResumeStep(true, [])).toBe('choice')
  })

  it('then at the last look once any provider is added, working or not, covering every type or not', () => {
    expect(setupResumeStep(true, [p('anthropic')])).toBe('review')
    expect(setupResumeStep(true, [p('assemblyai', 'key_refused')])).toBe('review')
    expect(setupResumeStep(true, [p('cloud')])).toBe('review')
  })
})

describe('finishSetup leaves models and voice optional @SC-710 @SC-1185', () => {
  let store: FakeProviderStore
  beforeEach(() => {
    store = new FakeProviderStore()
    useProviderStore(store)
    Object.assign(db, { org: { id: 'o1', setupCompletedAt: null }, firstAdmin: true, role: 'ADMIN', updated: 0, written: [] })
  })
  afterEach(() => useProviderStore(null))

  it('records setup with no provider at all, and writes no default', async () => {
    expect(await finishSetup('u1')).toBe(true)
    expect(db.updated).toBe(1)
    expect(db.written).toEqual([])
  })

  it('records setup with a model and no voice, writing only the one default model', async () => {
    const a = await store.create(provider('anthropic'))
    expect(await finishSetup('u1')).toBe(true)
    expect(db.written).toEqual([{ defaultConversationProviderId: a.id, defaultConversationModel: 'claude-sonnet-5' }])
  })

  it('records setup with voice and no model', async () => {
    await store.create(provider('assemblyai'))
    await store.create(provider('inworld'))
    expect(await finishSetup('u1')).toBe(true)
    expect(db.updated).toBe(1)
  })

  it('records setup once an LLM, an STT and a TTS work', async () => {
    await store.create(provider('anthropic'))
    await store.create(provider('assemblyai'))
    await store.create(provider('inworld'))
    expect(await finishSetup('u1')).toBe(true)
    expect(db.updated).toBe(1)
  })

  it('writes the three defaults that are not set when it finishes, and keeps one that is', async () => {
    db.org = { id: 'o1', setupCompletedAt: null, defaultConversationProviderId: 'x', defaultConversationModel: 'claude-haiku-4-5' } as typeof db.org
    await store.create(provider('anthropic'))
    const s = await store.create(provider('assemblyai'))
    const i = await store.create(provider('inworld'))
    await finishSetup('u1')
    expect(db.written).toEqual([{
      defaultSttProviderId: s.id, defaultSttModel: 'u3-rt-pro',
      defaultTtsProviderId: i.id, defaultTtsModel: 'inworld-tts-2', defaultTtsVoice: 'Alistair',
    }])
  })

  it('records setup with Agenthix Cloud alone, which covers all three', async () => {
    await store.create(provider('cloud'))
    expect(await finishSetup('u1')).toBe(true)
  })

  it('changes nothing, and does not ask for providers, for anyone but the first admin', async () => {
    db.firstAdmin = false
    expect(await finishSetup('u2')).toBe(false)
    expect(db.updated).toBe(0)
  })
})
