/**
 * Which tools the MCP server offers, and the two it answers itself. Every
 * other tool goes to a control-plane operation: __tests__/mcpTools.integration.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../siteConfig', () => ({
  getSitePublicUrl: () => 'https://my-site.fly.io',
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-abcd'),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}))

import { createMcpServer } from './mcpServer'
import { connectionCaller } from '../../shared/testing/connectionCaller'

describe('get_site_info tool @SC-111', () => {
  it('returns standalone status without querying HQ', async () => {
    const server = createMcpServer({ caller: connectionCaller() })
    // _registeredTools is a plain object keyed by tool name; each entry has a `handler` fn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools as Record<string, { handler: () => Promise<unknown> }>
    const entry = tools['get_site_info']
    expect(entry).toBeDefined()
    const result = await entry.handler()
    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ status: 'standalone', mode: 'standalone' }) }],
    })
  })
})

describe('start_preview tool gating @SC-303', () => {
  it("is absent for a person's connection, which is no run (adr-0090)", () => {
    const server = createMcpServer({ caller: connectionCaller() })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools as Record<string, unknown>
    expect(tools['start_preview']).toBeUndefined()
  })

  it('is present when the server is built with verified capability claims', () => {
    const claims = {
      tokenType: 'capability' as const,
      userId: 'u1', runner: { kind: 'person' as const, userId: 'u1' }, startedBy: 'person' as const, agentId: 'agent-1', sessionId: 's1',
      projectId: null, workspaceId: null, taskId: null, role: null, siteId: 'site-local',
      permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    }
    const server = createMcpServer({ caller: { kind: 'run', claims } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools as Record<string, unknown>
    expect(tools['start_preview']).toBeDefined()
  })
})
