import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// hq's setup state is derived from its data and never stored (setup spec); setup cannot finish without models and voice.

const db = vi.hoisted(() => ({
  org: { setupCompletedAt: null as Date | null },
  firstAdmin: true,
  role: 'ADMIN',
  updated: 0,
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

describe('claimStateOf @SC-709', () => {
  it('is unclaimed with no user, setting up with a first account, set up once setup is recorded', () => {
    expect(claimStateOf({ users: 0, setupCompletedAt: null })).toBe('unclaimed')
    expect(claimStateOf({ users: 1, setupCompletedAt: null })).toBe('setting_up')
    expect(claimStateOf({ users: 3, setupCompletedAt: new Date() })).toBe('set_up')
  })
})

describe('setupResumeStep @SC-709', () => {
  const p = (vendor: NewProvider['vendor'], state: NewProvider['state'] = 'works') => ({ vendor, state })

  it('opens at the choice while no model provider works', () => {
    expect(setupResumeStep([])).toBe('choice')
    expect(setupResumeStep([p('anthropic', 'key_refused')])).toBe('choice')
    expect(setupResumeStep([p('assemblyai'), p('inworld')])).toBe('choice')
  })

  it('opens at voice with a model provider but no speech-to-text or text-to-speech', () => {
    expect(setupResumeStep([p('anthropic')])).toBe('voice')
    expect(setupResumeStep([p('anthropic'), p('assemblyai')])).toBe('voice')
    expect(setupResumeStep([p('anthropic'), p('assemblyai'), p('inworld', 'unreachable')])).toBe('voice')
  })

  it('opens at the organisation once models and voice are covered, one provider or three', () => {
    expect(setupResumeStep([p('anthropic'), p('assemblyai'), p('inworld')])).toBe('organisation')
    expect(setupResumeStep([p('cloud')])).toBe('organisation')
  })
})

describe('finishSetup needs models and voice @SC-710', () => {
  let store: FakeProviderStore
  beforeEach(() => {
    store = new FakeProviderStore()
    useProviderStore(store)
    Object.assign(db, { org: { setupCompletedAt: null }, firstAdmin: true, role: 'ADMIN', updated: 0 })
  })
  afterEach(() => useProviderStore(null))

  it('refuses (409) and records nothing while a type is uncovered', async () => {
    await store.create(provider('anthropic'))
    await expect(finishSetup('u1')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.updated).toBe(0)
  })

  it('records setup once an LLM, an STT and a TTS work', async () => {
    await store.create(provider('anthropic'))
    await store.create(provider('assemblyai'))
    await store.create(provider('inworld'))
    expect(await finishSetup('u1')).toBe(true)
    expect(db.updated).toBe(1)
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
