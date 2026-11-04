/**
 * Who a bearer on hq's /mcp is (adr-0090) — the cases a real database cannot
 * produce: a lookup returning a row whose hash does not match, a role outside the
 * enum, a failed write of last use. The rest is connectionAuth.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const h = vi.hoisted(() => ({
  connectionFindUnique: vi.fn(),
  connectionUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
}))

vi.mock('wasp/server', () => ({
  prisma: {
    personConnection: { findUnique: h.connectionFindUnique, updateMany: h.connectionUpdateMany },
    user: { findUnique: h.userFindUnique },
  },
}))

import { authenticateConnection, LAST_USED_RESOLUTION_MS } from '../connectionAuth'
import { generateConnectionToken, CONNECTION_TOKEN_PREFIX } from '../connectionToken'

const NOW = new Date('2026-10-03T12:00:00Z')
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

function rowFor(token: string, over: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', userId: 'u1', name: 'Laptop', tokenHash: sha256(token), tokenPrefix: token.slice(0, 15),
    canRead: true, canChangeTasks: false, canStartWork: true, canManage: false,
    allProjects: true, projectIds: [],
    expiresAt: new Date(NOW.getTime() + 86_400_000), lastUsedAt: null, revokedAt: null,
    createdAt: NOW, updatedAt: NOW,
    ...over,
  }
}

let token: string

beforeEach(() => {
  vi.clearAllMocks()
  token = generateConnectionToken().token
  h.connectionFindUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
    where.tokenHash === sha256(token) ? rowFor(token) : null)
  h.userFindUnique.mockResolvedValue({ id: 'u1', settings: { role: 'MEMBER' }, deactivatedAt: null })
  h.connectionUpdateMany.mockResolvedValue({ count: 1 })
})

describe('a token', () => {
  it('is the prefix and 43 characters of randomness, and only its SHA-256 is kept', () => {
    const t = generateConnectionToken()
    expect(t.token.startsWith(CONNECTION_TOKEN_PREFIX)).toBe(true)
    expect(t.token).toHaveLength(CONNECTION_TOKEN_PREFIX.length + 43)
    expect(t.tokenHash).toBe(sha256(t.token))
    expect(t.tokenPrefix.length).toBeLessThan(t.token.length - 30)
    expect(generateConnectionToken().token).not.toBe(t.token)
  })
})

describe('authenticateConnection — defensive refusals', () => {
  it('refuses a row whose stored hash does not match the token, even if the lookup returned it', async () => {
    h.connectionFindUnique.mockResolvedValue(rowFor(token, { tokenHash: sha256('something else') }))
    expect(await authenticateConnection(token, NOW)).toBeNull()
  })

  it('refuses a deactivated person, even when their connections were not revoked', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'u1', settings: { role: 'MEMBER' }, deactivatedAt: NOW })
    expect(await authenticateConnection(token, NOW)).toBeNull()
  })

  it('refuses a role it does not know', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'u1', settings: { role: 'SUPERUSER' } })
    expect(await authenticateConnection(token, NOW)).toBeNull()
  })

  it('a failed write of last use does not fail the call', async () => {
    h.connectionFindUnique.mockResolvedValue(rowFor(token, { lastUsedAt: new Date(NOW.getTime() - LAST_USED_RESOLUTION_MS - 1) }))
    h.connectionUpdateMany.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await authenticateConnection(token, NOW)).not.toBeNull()
  })
})
