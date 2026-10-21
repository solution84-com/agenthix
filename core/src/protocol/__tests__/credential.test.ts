import { describe, it, expect } from 'vitest'
import { CREDENTIAL_PROVIDERS, type RunCredential } from '../credential.js'
import type { RunContextPayload } from '../runtimeData.js'

/**
 * The run's model credential rides the dispatch context (spec §6.3, ADR-0060).
 * Two halves are pinned here, and neither holds without the other:
 *
 *  - the payload carries `credential`, a tagged union, so a site can tell an
 *    API key from a subscription login without inspecting the string;
 *  - the payload no longer carries `llmApiKey`. That is a REQUIRED field
 *    leaving the wire, which is why the protocol major moved (ADR-0046) —
 *    connection.test.ts pins the version itself.
 *
 * `core`'s `npm test` runs `tsc --noEmit` first (see core/package.json's
 * `pretest`), so the `@ts-expect-error` below is genuinely checked: vitest
 * transpiles via esbuild, which strips the directive without validating it,
 * and would pass on its own even if `llmApiKey` were still declared.
 */
describe('the run credential on the dispatch context', () => {
  it('carries an API key credential the site can forward as an environment variable', () => {
    const credential: RunCredential = { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-test' }
    const context = baseContext(credential)
    expect(context.credential).toEqual({ kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-test' })
  })

  it('carries a subscription credential as the OAuth document, not a key', () => {
    const credential: RunCredential = { kind: 'subscription', provider: 'anthropic', oauthJson: '{"claudeAiOauth":{}}', grantId: 'g1', loginId: 'l1' }
    const context = baseContext(credential)
    expect(context.credential).toEqual({ kind: 'subscription', provider: 'anthropic', oauthJson: '{"claudeAiOauth":{}}', grantId: 'g1', loginId: 'l1' })
  })

  it('carries the provider, and a base URL for an OpenAI-compatible endpoint', () => {
    const credential: RunCredential = { kind: 'apiKey', provider: 'openai_compatible', apiKey: '', baseUrl: 'http://localhost:11434/v1' }
    expect(baseContext(credential).credential).toEqual(credential)
    expect(CREDENTIAL_PROVIDERS).toEqual(['openrouter', 'openai', 'google', 'anthropic', 'openai_compatible'])
  })

  it('a subscription is Anthropic\'s only', () => {
    // @ts-expect-error a subscription cannot name another provider
    const wrong: RunCredential = { kind: 'subscription', provider: 'openai', oauthJson: '{}' }
    void wrong
  })

  it('carries the org\'s web-search key when it has one, and none otherwise', () => {
    const withKey: RunContextPayload = { ...baseContext(null), webSearchKey: 'exa-key' }
    expect(JSON.parse(JSON.stringify(withKey)).webSearchKey).toBe('exa-key')
    expect('webSearchKey' in baseContext(null)).toBe(false)
  })

  it('carries null when the run has no usable credential at all', () => {
    expect(baseContext(null).credential).toBeNull()
  })

  it('carries why the credential is null, when hq knows, as text the site shows verbatim', () => {
    const context: RunContextPayload = { ...baseContext(null), credentialProblem: 'Ask an admin to set an API key.' }
    expect(JSON.parse(JSON.stringify(context)).credentialProblem).toBe('Ask an admin to set an API key.')
  })

  it('does not require credentialProblem, so a context without it is still valid', () => {
    const context: RunContextPayload = baseContext(null)
    expect('credentialProblem' in context).toBe(false)
  })

  it('no longer declares llmApiKey', () => {
    // @ts-expect-error `llmApiKey` left the wire — the credential above replaces it
    type Gone = RunContextPayload['llmApiKey']
    // Referenced so the alias is not merely unused; the directive above is the assertion.
    const gone: Gone | undefined = undefined
    expect(gone).toBeUndefined()
  })
})

function baseContext(credential: RunCredential | null): RunContextPayload {
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
    credential,
    packages: {
      agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
    },
  }
}
