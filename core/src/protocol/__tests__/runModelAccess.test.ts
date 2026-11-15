import { describe, it, expect } from 'vitest'
import type { RunContextPayload } from '../runtimeData.js'

/**
 * A run reaches its models through `modelAccess` alone (runProvider.ts). `core`'s `npm test` runs `tsc --noEmit`
 * first (core/package.json's `pretest`), so the `@ts-expect-error` lines below are checked: vitest transpiles via
 * esbuild, which strips the directive without validating it.
 */
describe("the run's model access on the dispatch context", () => {
  it('carries the provider the run reaches its model through', () => {
    const context: RunContextPayload = {
      ...baseContext(),
      modelAccess: {
        model: { providerId: 'p1', model: 'claude-sonnet-4-6' },
        provider: { kind: 'api_key', providerId: 'p1', vendor: 'anthropic', apiKey: 'sk-test' },
        billingProfileId: 'b1',
      },
    }
    expect(JSON.parse(JSON.stringify(context)).modelAccess.provider).toEqual({ kind: 'api_key', providerId: 'p1', vendor: 'anthropic', apiKey: 'sk-test' })
  })

  it("carries the org's web-search key when it has one, and none otherwise", () => {
    const withKey: RunContextPayload = { ...baseContext(), webSearchKey: 'exa-key' }
    expect(JSON.parse(JSON.stringify(withKey)).webSearchKey).toBe('exa-key')
    expect('webSearchKey' in baseContext()).toBe(false)
  })

  it('carries why there is no model access, when hq knows, as text the site shows verbatim', () => {
    const context: RunContextPayload = { ...baseContext(), credentialProblem: 'Ask an admin to set an API key.' }
    expect(JSON.parse(JSON.stringify(context)).credentialProblem).toBe('Ask an admin to set an API key.')
    expect('credentialProblem' in baseContext()).toBe(false)
  })

  it('declares no credential beside it', () => {
    // @ts-expect-error `credential` left the wire: `modelAccess` replaces it
    type Credential = RunContextPayload['credential']
    // @ts-expect-error `fallbackCredentials` left the wire: `modelAccess.others` replaces it
    type Fallbacks = RunContextPayload['fallbackCredentials']
    // @ts-expect-error `llmApiKey` left the wire long ago
    type Key = RunContextPayload['llmApiKey']
    const gone: Credential | Fallbacks | Key | undefined = undefined
    expect(gone).toBeUndefined()
  })
})

function baseContext(): RunContextPayload {
  return {
    agent: {
      id: 'agent-1',
      name: 'Ada',
      handle: 'ada',
      role: null,
      runtime: 'claude-sdk',
      approval: 'deferred',
      defaultModel: 'claude-sonnet-4-6',
      allowedTools: null,
      allowedBashPatterns: null,
      isKernel: false,
    },
    mounts: { ownerSlugs: {} },
    riskRules: null,
    packages: {
      agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
    },
  }
}
