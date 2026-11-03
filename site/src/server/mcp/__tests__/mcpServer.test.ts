/**
 * MCP tool classification (plan 5d-2 task 8): `ping`/`get_site_info` stay
 * local; every control-plane tool is a thin `callHqData(name, args, capabilityJwt)`
 * forward. `@modelcontextprotocol/sdk`'s `McpServer` is mocked to a recorder
 * — same "stub the transport, not the logic" posture as hq's own
 * mcpServer.authorization.test.ts — so each registered tool's handler can be
 * invoked directly without a real MCP transport.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withFeature } from '@agenthix/core/testing'

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

  it('offers no start_preview: live apps are started with start_app in a live preview @SC-1716', () => {
    expect(registrations.has('start_preview')).toBe(false)
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

describe('a tool call the gate refused at /mcp', () => {
  it('is answered with the refusal by whichever tool it names, and nothing is forwarded', async () => {
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', callRefusal: 'This run is pausing here.' })
    for (const name of ['get_org', 'ping', 'stop_processes']) {
      const result = await registrations.get(name)!({}) as { isError: boolean; content: Array<{ text: string }> }
      expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'This run is pausing here.' }] })
    }
    expect(mockCallHqData).not.toHaveBeenCalled()
  })
})

describe('the commit tool — offered only to a run on a branch\'s copy @SC-1732', () => {
  const context = (codeWork?: { branch: string }) =>
    ({ runId: 'run-7', sessionId: 's1', ...(codeWork ? { codeWork } : {}) }) as unknown as import('../../../agents/runtime/types').RunContext

  it('a run that is not code work is not offered it', () => {
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context(), openCode: false } })
    expect(registrations.has('commit')).toBe(false)
    expect(registrations.has('merge_into_main')).toBe(false)
  })

  it('a code-work run is, and its call goes to hq with the run filled in by the site', async () => {
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context({ branch: 'add-login-page' }), openCode: false } })
    mockCallHqData.mockResolvedValue({ committed: true, commit: 'a'.repeat(40), branch: 'add-login-page', files: 2 })
    await registrations.get('commit')!({ message: 'Add the login form', runId: 'someone-else' })
    expect(mockCallHqData).toHaveBeenCalledWith('commit', { message: 'Add the login form', runId: 'run-7' }, 'jwt-1')
    await registrations.get('merge_into_main')!({ summary: 'Login page' })
    expect(mockCallHqData).toHaveBeenCalledWith('merge_into_main', { summary: 'Login page', runId: 'run-7' }, 'jwt-1')
  })
})

describe('the live preview off: no app tools, and no live preview used (adr-0172) @SC-1776', () => {
  const APP_TOOLS = ['start_app', 'stop_app', 'list_apps', 'reload_view', 'set_auto_reload']
  const context = (codeWork?: { branch: string }) =>
    ({ runId: 'run-9', sessionId: 's1', ...(codeWork ? { codeWork } : {}) }) as unknown as import('../../../agents/runtime/types').RunContext
  const claim = { livePreviewId: 'lp-1', workspaceId: 'ws-1', branch: 'add-banner' }
  afterEach(() => { vi.unstubAllEnvs() })

  it('a code-work run, even one whose capability names a live preview, is offered none', () => {
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', livePreview: claim, siteTools: { context: context({ branch: 'add-banner' }), openCode: true } })
    for (const name of APP_TOOLS) expect(registrations.has(name), name).toBe(false)
    expect(registrations.has('commit')).toBe(true)
  })

  it('a run that is not code work is not given the package tools for a live preview its capability names', () => {
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', livePreview: claim, siteTools: { context: context(), openCode: true } })
    expect([...registrations.keys()].filter(n => n.includes('package'))).toEqual([])
  })

  it("is off on a production site whatever the run's switches say", () => {
    vi.stubEnv('NODE_ENV', 'production')
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', features: { livePreview: true }, siteTools: { context: context({ branch: 'add-banner' }), openCode: true } })
    for (const name of APP_TOOLS) expect(registrations.has(name), name).toBe(false)
  })

  it("is on in a development build when the run's switches say so", () => {
    vi.stubEnv('NODE_ENV', 'development')
    registrations.clear()
    createMcpServer({ capabilityJwt: 'jwt-1', features: { livePreview: true }, siteTools: { context: context({ branch: 'add-banner' }), openCode: true } })
    for (const name of APP_TOOLS) expect(registrations.has(name), name).toBe(true)
  })
})

withFeature('livePreview', () => {
  describe('the app tools — offered to every code-work run, checked by hq at each call @SC-1701', () => {
    const APP_TOOLS = ['start_app', 'stop_app', 'list_apps', 'reload_view', 'set_auto_reload']
    const context = (codeWork?: { branch: string }) =>
      ({ runId: 'run-9', sessionId: 's1', ...(codeWork ? { codeWork } : {}) }) as unknown as import('../../../agents/runtime/types').RunContext
    const claim = { livePreviewId: 'lp-1', workspaceId: 'ws-1', branch: 'add-banner' }

    // A harness lists a conversation's tools once, when it connects, and keeps that list for the conversation's later
    // runs: a run on a branch whose live preview started after the first listing must still have them.
    it('a code-work run whose capability names no live preview is offered them all the same', () => {
      registrations.clear()
      createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context({ branch: 'add-banner' }), openCode: true } })
      for (const name of APP_TOOLS) expect(registrations.has(name), name).toBe(true)
    })

    it('a code-work run with a live preview is offered them', () => {
      registrations.clear()
      createMcpServer({ capabilityJwt: 'jwt-1', livePreview: claim, siteTools: { context: context({ branch: 'add-banner' }), openCode: true } })
      for (const name of APP_TOOLS) expect(registrations.has(name), name).toBe(true)
    })

    it('a run that is not code work and names no live preview is not', () => {
      registrations.clear()
      createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context(), openCode: true } })
      for (const name of APP_TOOLS) expect(registrations.has(name), name).toBe(false)
    })

    it('a call goes to hq, which answers it, with the run filled in by the site', async () => {
      registrations.clear()
      createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context({ branch: 'add-banner' }), openCode: true } })
      mockCallHqData.mockRejectedValue(new FakeHqDataError(400, 'This branch has no live preview open. Nothing was changed.'))
      const result = await registrations.get('start_app')!({ name: 'web', folder: '', command: 'npm start', port: '3000' }) as { content: Array<{ text: string }>; isError?: boolean }
      expect(mockCallHqData).toHaveBeenCalledWith('start_app', { name: 'web', folder: '', command: 'npm start', port: '3000', runId: 'run-9' }, 'jwt-1')
      expect(result.isError).toBe(true)
      expect(textOf(result)).toEqual({ error: 'This branch has no live preview open. Nothing was changed.' })
    })
  })
})
