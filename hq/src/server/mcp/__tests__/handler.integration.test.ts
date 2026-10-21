/**
 * hq's /mcp accepts one kind of bearer: a person's own connection (adr-0090),
 * looked up in the real test database. Agents reach their site's /mcp instead,
 * and there is no org-wide key. Every refusal is the same 401. The MCP
 * transport itself is the SDK's, so it is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../mcpServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcpServer')>()
  return { ...actual, createMcpServer: vi.fn(() => ({ connect: vi.fn(async () => undefined) })) }
})
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(function () {
    return { handleRequest: vi.fn().mockResolvedValue(undefined) }
  }),
}))

import { mcpHandler } from '../handler'
import { createMcpServer } from '../mcpServer'
import { generateConnectionToken } from '../../../connections/connectionToken'

const serve = vi.mocked(createMcpServer)
async function call(authorization?: string) {
  const res = { code: 200, body: undefined as unknown, status(c: number) { res.code = c; return res }, json(b: unknown) { res.body = b; return res } }
  // The Wasp API type wants Express's request and response; these pass the fields the handler reads.
  await (mcpHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<void>)(
    { headers: authorization ? { authorization } : {}, body: {} }, res, {},
  )
  return res
}

let userId: string
async function connection(data: { expiresAt?: Date; revokedAt?: Date | null; canManage?: boolean; allProjects?: boolean; projectIds?: string[] } = {}) {
  const { token, tokenHash, tokenPrefix } = generateConnectionToken()
  const row = await prisma.personConnection.create({
    data: { userId, name: 'My tool', tokenHash, tokenPrefix, expiresAt: new Date(Date.now() + 86_400_000), ...data },
  })
  return { token, id: row.id }
}

beforeEach(async () => {
  serve.mockClear()
  userId = (await createUserWithRole('MEMBER')).id
})

describe("MCP handler — a person's connection is the only way in", () => {
  it('401s a request with no Authorization header', async () => {
    expect((await call()).code).toBe(401)
    expect(serve).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown token', async () => 'ahx_conn_whatever'],
    ['the retired org-wide key', async () => 'sk_mcp_abcd_0123'],
    ['an expired connection', async () => (await connection({ expiresAt: new Date(Date.now() - 1000) })).token],
    ['a revoked connection', async () => (await connection({ revokedAt: new Date() })).token],
    ['a connection whose person has no role any more', async () => {
      const { token } = await connection()
      await prisma.userSettings.deleteMany({ where: { userId } })
      return token
    }],
    ['a connection whose person is gone', async () => {
      const { token } = await connection()
      await prisma.userSettings.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } })
      return token
    }],
  ])('401s %s, the same way as every other refusal', async (_what, token) => {
    const res = await call(`Bearer ${await token()}`)
    expect(res).toMatchObject({ code: 401, body: { error: 'Unauthorized: this connection is unknown, expired or revoked' } })
    expect(serve).not.toHaveBeenCalled()
  })

  it('serves a valid connection as its person, with its own groups and project list', async () => {
    const { token, id } = await connection({ canManage: true, allProjects: false, projectIds: ['p1'] })
    const res = await call(`Bearer ${token}`)
    expect(res.code).toBe(200)
    expect(serve).toHaveBeenCalledWith({
      caller: { kind: 'connection', connection: { connectionId: id, userId, role: 'MEMBER', groups: new Set(['read', 'manage']), projectIds: ['p1'] } },
    })
  })
})
