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
  permissions: {
    bypassed: false, allowedTools: [{ name: 'write_file', state: 'always' as const }], allowedBashPatterns: [], neverTools: [] as string[],
  },
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
      livePreview: null,
      trustedPackageScopes: [],
      siteTools: { context: null, openCode: false },
    })
  })

  it("hands the package tools the organisation's trusted scopes from the verified capability only, and none for a bad value (adr-0170)", async () => {
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 }, runId: null })
    for (const [signed, given] of [
      [['@fernhill', '@garden'], ['@fernhill', '@garden']],
      [['@fernhill', 'not a scope'], []],
      ['@fernhill', []],
      [['@fernhill', '@fernhill'], []],
    ] as const) {
      h.createMcpServer.mockClear()
      h.verifyHqToken.mockResolvedValue({ ...CLAIMS, trustedPackageScopes: signed })
      const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' })
      await mcpHandler(req, res)
      expect(h.createMcpServer).toHaveBeenCalledWith(expect.objectContaining({ trustedPackageScopes: given }))
    }
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

  it('leaves the knowledge change tools out of the list of a run that may change no files, and keeps its never-listed tools @SC-1395', async () => {
    const claims = { ...CLAIMS, permissions: { ...CLAIMS.permissions, allowedTools: [{ name: 'read_file', state: 'always' as const }], neverTools: ['delete_task'] } }
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 }, runId: null })
    h.verifyHqToken.mockResolvedValue(claims)
    await mcpHandler(makeReqRes({ authorization: 'Bearer t' }).req, makeReqRes().res)
    expect(h.createMcpServer).toHaveBeenLastCalledWith(expect.objectContaining({
      disabledTools: new Set(['delete_task', 'write_knowledge', 'edit_knowledge', 'delete_knowledge']),
    }))
  })

  it('offers them to a run that may change files, bypassed or granted @SC-1395', async () => {
    h.resolvePlatformToken.mockReturnValue({ holder: { jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 }, runId: null })
    h.verifyHqToken.mockResolvedValue({ ...CLAIMS, permissions: { ...CLAIMS.permissions, bypassed: true, allowedTools: [] } })
    await mcpHandler(makeReqRes({ authorization: 'Bearer t' }).req, makeReqRes().res)
    expect(h.createMcpServer).toHaveBeenLastCalledWith(expect.objectContaining({ disabledTools: undefined }))
  })
})
