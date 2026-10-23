import { describe, expect, it } from 'vitest'
import type { RunModelAccess } from '@agenthix/core'
import { isRelayed, runAccessOf, turnRelayCredentials } from '../runAccess'
import { cloudKeyHeaders, upstreamBase } from '../relayProviders'

const access: RunModelAccess = {
  model: { providerId: 'p-ant', model: 'claude-sonnet-5' },
  provider: { kind: 'api_key', providerId: 'p-ant', vendor: 'anthropic', apiKey: 'sk-test-fake' },
  others: [
    { kind: 'api_key', providerId: 'p-or', vendor: 'openrouter', apiKey: 'or-test-fake' },
    { kind: 'cloud', providerId: 'p-cloud', vendor: 'cloud', api: 'openai', baseUrl: 'https://cloud.example/ai/v1/openai' },
    { kind: 'subscription', providerId: 'p-mine', vendor: 'anthropic', oauthJson: '{}', grantId: 'g', loginId: 'l' },
    { kind: 'api_key', providerId: 'p-voice', vendor: 'assemblyai', apiKey: 'aai-test-fake' },
  ],
  billingProfileId: 'bp-1',
}

describe("a run's providers, as the site uses them @SC-1230", () => {
  it('reads the descriptor first, each relayed provider keyed by the relay path it is reached at', () => {
    const run = runAccessOf({ modelAccess: access, credential: { kind: 'apiKey', provider: 'google', apiKey: 'ignored' } })
    expect(run.credential).toEqual({ kind: 'apiKey', providerId: 'p-ant', provider: 'anthropic', apiKey: 'sk-test-fake' })
    expect(run.others).toEqual([
      { kind: 'apiKey', providerId: 'p-or', provider: 'openrouter', apiKey: 'or-test-fake' },
      { kind: 'cloud', providerId: 'p-cloud', provider: 'openai', baseUrl: 'https://cloud.example/ai/v1/openai' },
    ])
    expect(run.billingProfileId).toBe('bp-1')
  })

  it("gives a person's own subscription as the run's login, never to the relay", () => {
    const run = runAccessOf({ modelAccess: { ...access, provider: access.others![2] }, credential: null })
    expect(run.credential).toMatchObject({ kind: 'subscription', oauthJson: '{}', grantId: 'g', loginId: 'l', providerId: 'p-mine' })
    expect(isRelayed(run.credential)).toBe(false)
    expect(turnRelayCredentials({ credential: run.credential, fallbackCredentials: run.others }).map(c => c.providerId)).toEqual(['p-or', 'p-cloud'])
  })

  it("reads an older hq's credential and fallbacks, which name no provider id", () => {
    const run = runAccessOf({ credential: { kind: 'apiKey', provider: 'openai', apiKey: 'k' }, fallbackCredentials: [{ kind: 'apiKey', provider: 'google', apiKey: 'g' }] })
    expect(run).toEqual({ credential: { kind: 'apiKey', provider: 'openai', apiKey: 'k' }, others: [{ kind: 'apiKey', provider: 'google', apiKey: 'g' }], billingProfileId: null })
  })

  it('has no billing profile while hq has none', () => {
    expect(runAccessOf({ modelAccess: { ...access, billingProfileId: '' }, credential: null }).billingProfileId).toBeNull()
  })
})

describe("Agenthix Cloud's gateway, as the relay reaches it @SC-1230", () => {
  const cloud = { kind: 'cloud' as const, providerId: 'p', provider: 'anthropic' as const, baseUrl: 'https://cloud.example/ai/v1/anthropic/' }

  it('is reached over HTTPS only, at the address hq gave', () => {
    expect(upstreamBase(cloud)).toBe('https://cloud.example/ai/v1/anthropic')
    expect(upstreamBase({ ...cloud, baseUrl: 'http://cloud.example/ai' })).toBeNull()
    expect(upstreamBase({ ...cloud, baseUrl: 'https://user:pw@cloud.example/ai' })).toBeNull()
  })

  it("is given hq's token in the header its API reads, and the call and profile only when billing is on", () => {
    expect(cloudKeyHeaders(cloud, 't', null)).toEqual({ 'x-api-key': 't' })
    expect(cloudKeyHeaders({ ...cloud, provider: 'openai' }, 't', null)).toEqual({ authorization: 'Bearer t' })
    expect(cloudKeyHeaders(cloud, 't', { callId: 'call-1234', billingProfileId: 'bp' }))
      .toEqual({ 'x-api-key': 't', 'x-call-id': 'call-1234', 'x-billing-profile-id': 'bp' })
  })
})
