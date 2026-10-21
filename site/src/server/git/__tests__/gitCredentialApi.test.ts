/**
 * Git credential endpoint token resolution (plan 5d-2 task 8). Same
 * one-auth-branch posture as mcp/handler.ts — no static-key fallback exists
 * on site (escalation rule: only the container-facing capability path
 * moves). Repo attachment lookup is site-local (workspaceRows, plan 5c);
 * membership + GitHub App token minting forward to hq's new
 * `resolve_git_credential` op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  resolveRunToken: vi.fn(),
  verifyHqToken: vi.fn(),
  findRepoAttachmentByUrl: vi.fn(),
  callHqData: vi.fn(),
}))

vi.mock('../../runtime/runTokens', () => ({ resolveRunToken: h.resolveRunToken }))
vi.mock('../../identity/verifyHqToken', () => ({ verifyHqToken: h.verifyHqToken }))
vi.mock('../../storage/workspaceRows', () => ({ findRepoAttachmentByUrl: h.findRepoAttachmentByUrl }))

const { FakeHqDataError } = vi.hoisted(() => ({
  FakeHqDataError: class FakeHqDataError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  },
}))
vi.mock('../../hq/dataClient', () => ({ callHqData: h.callHqData, HqDataError: FakeHqDataError }))

import { gitCredentialHandler } from '../gitCredentialApi'

function makeReqRes(headers: Record<string, string> = {}, body: unknown = {}) {
  const req = { headers, body } as any
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
})

describe('auth', () => {
  it('401s a missing Authorization header', async () => {
    const { req, res } = makeReqRes()
    await gitCredentialHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('401s a bearer that misses the run-token registry', async () => {
    h.resolveRunToken.mockReturnValue(null)
    const { req, res } = makeReqRes({ authorization: 'Bearer garbage' })
    await gitCredentialHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(h.verifyHqToken).not.toHaveBeenCalled()
  })

  it('@SC-348 — a foreign-audience capability fails verifyHqToken and is refused with 401', async () => {
    h.resolveRunToken.mockReturnValue({ jwt: 'foreign-jwt', expiresAt: Date.now() + 60_000 })
    h.verifyHqToken.mockRejectedValue(new Error('audience mismatch'))
    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' }, { owner: 'acme', repo: 'widgets' })

    await gitCredentialHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(h.findRepoAttachmentByUrl).not.toHaveBeenCalled()
  })
})

describe('resolution', () => {
  beforeEach(() => {
    h.resolveRunToken.mockReturnValue({ jwt: 'holder-jwt', expiresAt: Date.now() + 60_000 })
    h.verifyHqToken.mockResolvedValue(CLAIMS)
  })

  it('400s a request missing owner/repo', async () => {
    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' }, {})
    await gitCredentialHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('403s when no repo attachment exists locally — never reaches hq', async () => {
    h.findRepoAttachmentByUrl.mockResolvedValue(null)
    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' }, { owner: 'acme', repo: 'widgets' })

    await gitCredentialHandler(req, res)

    expect(h.findRepoAttachmentByUrl).toHaveBeenCalledWith({ repoUrl: 'https://github.com/acme/widgets' })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(h.callHqData).not.toHaveBeenCalled()
  })

  it('resolves the repo locally then forwards the mint to hq, returning its credential', async () => {
    h.findRepoAttachmentByUrl.mockResolvedValue({ ownerType: 'project', ownerId: 'proj-1', workspaceId: null })
    h.callHqData.mockResolvedValue({ username: 'x-access-token', password: 'ghs_abc' })

    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' }, { owner: 'acme', repo: 'widgets.git' })
    await gitCredentialHandler(req, res)

    expect(h.callHqData).toHaveBeenCalledWith(
      'resolve_git_credential',
      { agentId: 'agent-1', ownerType: 'project', ownerId: 'proj-1', workspaceId: null, owner: 'acme', repo: 'widgets' },
      'holder-jwt',
    )
    expect(res.json).toHaveBeenCalledWith({ username: 'x-access-token', password: 'ghs_abc' })
  })

  it('a forward failure surfaces hq\'s status and message', async () => {
    h.findRepoAttachmentByUrl.mockResolvedValue({ ownerType: 'project', ownerId: 'proj-1', workspaceId: null })
    h.callHqData.mockRejectedValue(new FakeHqDataError(403, 'Agent is not a member of this project.'))

    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' }, { owner: 'acme', repo: 'widgets' })
    await gitCredentialHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Agent is not a member of this project.' })
  })

  // status 0 (dataClient.ts's unregistered/unreachable/timeout paths) is a
  // gateway failure, not a permission decision — must not collapse into 403
  // via `e.status || 403`'s falsy-0 bug (spec review).
  it('an unregistered/unreachable hq (HqDataError status 0) surfaces as 502, never 403', async () => {
    h.findRepoAttachmentByUrl.mockResolvedValue({ ownerType: 'project', ownerId: 'proj-1', workspaceId: null })
    h.callHqData.mockRejectedValue(new FakeHqDataError(0, 'hq is unreachable'))

    const { req, res } = makeReqRes({ authorization: 'Bearer run-token-abc' }, { owner: 'acme', repo: 'widgets' })
    await gitCredentialHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({ error: 'hq is unreachable' })
  })
})
