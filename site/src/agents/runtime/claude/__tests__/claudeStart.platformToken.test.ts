import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site:4201' }))

import { buildClaudeStart } from '../claudeStart'
import { claudeTestContext } from '../../__tests__/claudeTestContext'
import { PLATFORM_AUTHORIZATION, PLATFORM_TOKEN_ENV } from '../../agentImage'

const TOKEN = 'run-token-0123456789'
const platform = (authorization: string) => ({ platform: { type: 'http' as const, url: 'http://site:4201/mcp', headers: { Authorization: authorization } } })

// The SDK turns the query's options into the CLI's command line (`--mcp-config`
// among them), which every process in the container can read through /proc.
describe("a claude process's platform token is never on its command line", () => {
  it('in a container: the connection names the variable, and only the exec environment holds the token', () => {
    const start = buildClaudeStart(claudeTestContext({
      containerName: 'agent-c1', mcpServers: platform(PLATFORM_AUTHORIZATION), gitCredEnv: { [PLATFORM_TOKEN_ENV]: TOKEN },
    }), null)
    expect(JSON.stringify(start.options)).not.toContain(TOKEN)
    expect((start.options.mcpServers as ReturnType<typeof platform>).platform.headers.Authorization).toBe('Bearer ${SITE_MCP_KEY}')
    expect(start.execEnv[PLATFORM_TOKEN_ENV]).toBe(TOKEN)
  })

  it("without a container: the token is in the process's own environment, which the CLI expands the connection from", () => {
    const start = buildClaudeStart(claudeTestContext({ mcpServers: platform(PLATFORM_AUTHORIZATION), gitCredEnv: { [PLATFORM_TOKEN_ENV]: TOKEN } }), null)
    const { env, ...rest } = start.options
    expect(JSON.stringify(rest)).not.toContain(TOKEN)
    expect((env as Record<string, string>)[PLATFORM_TOKEN_ENV]).toBe(TOKEN)
  })

  it('refuses a connection that carries the token itself', () => {
    expect(() => buildClaudeStart(claudeTestContext({
      containerName: 'agent-c1', mcpServers: platform(`Bearer ${TOKEN}`), gitCredEnv: { [PLATFORM_TOKEN_ENV]: TOKEN },
    }), null)).toThrow(/command line/)
  })

  it('starts a new process when the token changes', () => {
    const start = (token: string) => buildClaudeStart(claudeTestContext({ mcpServers: platform(PLATFORM_AUTHORIZATION), gitCredEnv: { [PLATFORM_TOKEN_ENV]: token } }), null)
    expect(start('token-one-0123').fingerprint).not.toBe(start('token-two-0123').fingerprint)
  })
})
