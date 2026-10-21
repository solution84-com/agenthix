/**
 * MCP tool classification (plan 5d-2 task 8): `ping`/`get_site_info` stay
 * local; every control-plane tool is a thin `callHqData(name, args, capabilityJwt)`
 * forward. `@modelcontextprotocol/sdk`'s `McpServer` is mocked to a recorder
 * — same "stub the transport, not the logic" posture as hq's own
 * mcpServer.authorization.test.ts — so each registered tool's handler can be
 * invoked directly without a real MCP transport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registrations = vi.hoisted(() => new Map<string, (args: unknown) => Promise<unknown>>())

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: (...args: unknown[]) => {
      const name = args[0] as string
      const handler = args[args.length - 1] as (a: unknown) => Promise<unknown>
      registrations.set(name, handler)
    },
  })),
}))

const { mockCallHqData, FakeHqDataError } = vi.hoisted(() => {
  class FakeHqDataError extends Error {
    constructor(public status: number, message: string) { super(message) }
  }
  return { mockCallHqData: vi.fn(), FakeHqDataError }
})
vi.mock('../../hq/dataClient', () => ({ callHqData: mockCallHqData, HqDataError: FakeHqDataError }))

import { createMcpServer } from '../mcpServer'

beforeEach(() => {
  vi.clearAllMocks()
  registrations.clear()
  createMcpServer({ capabilityJwt: 'jwt-1' })
})

function textOf(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0].text)
}

describe('local tools — touch no control-plane data', () => {
  it('ping never calls callHqData', async () => {
    const result = await registrations.get('ping')!({})
    expect(mockCallHqData).not.toHaveBeenCalled()
    expect(textOf(result as any)).toMatchObject({ pong: true })
  })

  it('get_site_info never calls callHqData', async () => {
    const result = await registrations.get('get_site_info')!({})
    expect(mockCallHqData).not.toHaveBeenCalled()
    expect(textOf(result as any)).toEqual({ status: 'standalone', mode: 'standalone' })
  })
})

describe('forwarded tools — thin callHqData forwards', () => {
  it('a control-plane tool (get_org) forwards via callHqData with the resolved capability', async () => {
    mockCallHqData.mockResolvedValue({ orgId: 'org-1', name: 'Acme' })
    const result = await registrations.get('get_org')!({})
    expect(mockCallHqData).toHaveBeenCalledWith('get_org', {}, 'jwt-1')
    expect(textOf(result as any)).toEqual({ orgId: 'org-1', name: 'Acme' })
  })

  it('start_preview forwards too — the preview subsystem stays hq-owned (D6)', async () => {
    mockCallHqData.mockResolvedValue({ url: 'http://localhost:1234', status: 'running' })
    const result = await registrations.get('start_preview')!({ command: 'npm run dev', port: 5173 })
    expect(mockCallHqData).toHaveBeenCalledWith('start_preview', { command: 'npm run dev', port: 5173 }, 'jwt-1')
    expect(textOf(result as any)).toEqual({ url: 'http://localhost:1234', status: 'running' })
  })

  it('a forward that fails with HqDataError renders as an MCP tool error, not a thrown exception', async () => {
    mockCallHqData.mockRejectedValue(new FakeHqDataError(403, 'forbidden'))
    const result = await registrations.get('get_org')!({})
    expect((result as any).isError).toBe(true)
    expect(textOf(result as any)).toEqual({ error: 'forbidden' })
  })

  // The rethrow branch (mcpServer.ts's `if (e instanceof HqDataError) ...;
  // throw e`): a failure that ISN'T HqDataError (a genuine bug, not an
  // expected forward failure) must propagate, not be swallowed into a
  // same-shaped MCP tool error as if it were an ordinary rejection.
  it('a non-HqDataError failure propagates instead of being rendered as a tool error', async () => {
    mockCallHqData.mockRejectedValue(new TypeError('unexpected shape'))
    await expect(registrations.get('get_org')!({})).rejects.toThrow(TypeError)
  })
})

describe('disabledTools patches out a tool entirely', () => {
  it('a neverTools-listed tool is never registered', () => {
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', disabledTools: new Set(['get_org']) })
    expect(registrations.has('get_org')).toBe(false)
    expect(registrations.has('list_agents')).toBe(true)
  })
})
