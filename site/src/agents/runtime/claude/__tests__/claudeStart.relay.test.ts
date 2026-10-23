import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site:4201' }))

import { buildClaudeStart } from '../claudeStart'
import { claudeTestContext } from '../../__tests__/claudeTestContext'

const inContainer = { containerName: 'agent-c1', gitCredEnv: {} }

describe("a claude process's provider, from hq's descriptor", () => {
  it('reaches an API key through the relay, with the key helper, and never holds the key', () => {
    const start = buildClaudeStart(claudeTestContext({ ...inContainer, credential: { kind: 'apiKey', providerId: 'p', provider: 'anthropic', apiKey: 'sk-test-fake' } }), null)
    expect(start.relayed).toBe(true)
    expect(start.execEnv.ANTHROPIC_BASE_URL).toBe('http://site:4201/api/v1/model-relay/anthropic')
    expect(JSON.stringify(start.execEnv)).not.toContain('sk-test-fake')
    expect((start.options.settings as { apiKeyHelper?: string }).apiKeyHelper).toBeTruthy()
  })

  it('reaches Agenthix Cloud the same way, through the relay, which presents hq\'s Cloud token', () => {
    const start = buildClaudeStart(claudeTestContext({
      ...inContainer, credential: { kind: 'cloud', providerId: 'p', provider: 'anthropic', baseUrl: 'https://cloud.example/ai/v1/anthropic' },
    }), null)
    expect(start.relayed).toBe(true)
    expect(start.execEnv.ANTHROPIC_BASE_URL).toBe('http://site:4201/api/v1/model-relay/anthropic')
    expect(JSON.stringify(start.execEnv)).not.toContain('cloud.example')
  })

  it("never relays a person's own subscription: it is the run's login file", () => {
    const start = buildClaudeStart(claudeTestContext({
      ...inContainer, credential: { kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'g', loginId: 'l', providerId: 'p' },
    }), null)
    expect(start.relayed).toBe(false)
    expect(start.execEnv.ANTHROPIC_BASE_URL).toBeUndefined()
    expect((start.options.settings as { apiKeyHelper?: string }).apiKeyHelper).toBeUndefined()
  })
})
