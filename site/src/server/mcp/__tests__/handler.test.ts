/**
 * MCP handler auth tests — site's half (plan 5d-2 task 8). Site has exactly
 * one auth branch (no static-key/admin path — escalation rule: "only the
 * container-facing capability path moves"). Same stub-the-transport approach
 * as hq's own handler.test.ts.
 *
 * `verifyHqToken` always pins the audience to THIS site's own siteId
 * (identity/verifyHqToken.ts) — a token minted for a sibling site fails
 * verification there and this handler must 401 it, never reaching
 * createMcpServer. @SC-348.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  resolvePlatformToken: vi.fn(),
  gateRunContext: vi.fn(),
  verifyHqToken: vi.fn(),
  createMcpServer: vi.fn(),
}))

vi.mock('../../runtime/runTokens', () => ({ resolvePlatformToken: h.resolvePlatformToken }))
vi.mock('../../../agents/runtime/toolGateRuns', () => ({ gateRunContext: h.gateRunContext }))
vi.mock('../../identity/verifyHqToken', () => ({ verifyHqToken: h.verifyHqToken }))
vi.mock('../mcpServer', () => ({ createMcpServer: h.createMcpServer }))

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { mcpHandler } from '../handler'

function makeReqRes(headers: Record<string, string> = {}) {
  const req = { headers, body: {} } as any
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any
  return { req, res }
}

const CLAIMS = {
  tokenType: 'capability' as const,
  userId: 'u1', agentId: 'agent-1', sessionId: 's1',
  projectId: null, workspaceId: null, taskId: null, role: null, siteId: 'this-site',
  permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] as string[] },
}

beforeEach(() => {
  vi.clearAllMocks()
  h.createMcpServer.mockReturnValue({ connect: vi.fn().mockResolvedValue(undefined) })
})

describe('MCP handler — the one auth branch', () => {
  it('401s a missing/malformed Authorization header', async () => {
    const { req, res } = makeReqRes()
    await mcpHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(h.createMcpServer).not.toHaveBeenCalled()
  })

  it('401s a bearer that misses the run-token registry — no static-key fallback exists on site', async () => {
    h.resolvePlatformToken.mockReturnValue(null)
    const { req, res } = makeReqRes({ authorization: 'Bearer garbage' })
    await mcpHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(h.verifyHqToken).not.toHaveBeenCalled()
    expect(h.createMcpServer).not.toHaveBeenCalled()
  })

  it('serves the request when the bearer resolves and verifies', async () => {
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 }, runId: null })
    h.verifyHqToken.mockResolvedValue(CLAIMS)
    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' })

    await mcpHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(401)
    // claims itself is not passed to createMcpServer —
    // only the two values derived from it (disabledTools, capabilityJwt).
    expect(h.createMcpServer).toHaveBeenCalledWith({
      disabledTools: undefined,
      capabilityJwt: 'holder-jwt',
      siteTools: { context: null, openCode: false },
    })
  })

  it('@SC-348 — a capability audienced to a sibling site fails verifyHqToken (its own audience pin) and is refused with 401', async () => {
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'foreign-audience-jwt', expiresAt: Date.now() + 60_000 }, runId: null })
    h.verifyHqToken.mockRejectedValue(new Error('audience mismatch'))
    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' })

    await mcpHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(h.createMcpServer).not.toHaveBeenCalled()
  })

  it('derives disabledTools from claims.permissions.neverTools', async () => {
    const claims = { ...CLAIMS, permissions: { ...CLAIMS.permissions, neverTools: ['delete_task'] } }
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 }, runId: null })
    h.verifyHqToken.mockResolvedValue(claims)
    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' })

    await mcpHandler(req, res)

    expect(h.createMcpServer).toHaveBeenCalledWith(expect.objectContaining({ disabledTools: new Set(['delete_task']) }))
  })

  it('hands the site\'s own tools the running turn of the conversation the capability names, and says whether OpenCode asks', async () => {
    const turn = { runId: 'run-1', sessionId: 's1' }
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 }, runId: 'run-1' })
    h.verifyHqToken.mockResolvedValue(CLAIMS)
    h.gateRunContext.mockReturnValue(turn)
    await mcpHandler(makeReqRes({ authorization: 'Bearer t', 'x-agenthix-harness': 'opencode' }).req, makeReqRes().res)
    expect(h.gateRunContext).toHaveBeenCalledWith('run-1')
    expect(h.createMcpServer).toHaveBeenLastCalledWith(expect.objectContaining({ siteTools: { context: turn, openCode: true } }))

    h.gateRunContext.mockReturnValue({ runId: 'run-1', sessionId: 'another-conversation' })
    await mcpHandler(makeReqRes({ authorization: 'Bearer t' }).req, makeReqRes().res)
    expect(h.createMcpServer).toHaveBeenLastCalledWith(expect.objectContaining({ siteTools: { context: null, openCode: false } }))
  })
})
