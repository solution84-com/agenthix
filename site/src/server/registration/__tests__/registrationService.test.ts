import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHqUpsert = vi.hoisted(() => vi.fn())
const mockHqFindFirst = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: { hqConnection: { upsert: mockHqUpsert, findFirst: mockHqFindFirst } },
}))
const mockRestart = vi.hoisted(() => vi.fn())
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { restart: mockRestart } }))

import { storeHqLink } from '../registrationService'
import { readConnectionToken } from '../../hq/connectionToken'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 6).toString('base64')

const link = { orgId: 'org-1', hqUrl: 'https://hq.example.com', hqWsUrl: 'wss://hq.example.com', machineCredential: 'smc_a_b' }

beforeEach(() => {
  vi.clearAllMocks()
  mockRestart.mockResolvedValue(undefined)
  mockHqUpsert.mockResolvedValue({})
  mockHqFindFirst.mockResolvedValue(null)
})

describe('storing the link to hq', () => {
  it('stores the credential encrypted where the transport already looks for it', async () => {
    await storeHqLink(link)
    const { where, create, update } = mockHqUpsert.mock.calls[0][0]
    expect(where).toEqual({ id: 'singleton' })
    expect(create).toMatchObject({ orgId: 'org-1', hqWsUrl: 'wss://hq.example.com', status: 'PENDING' })
    for (const written of [create, update]) {
      expect(written.connectionToken).not.toContain('smc_a_b')
      expect(readConnectionToken(written.connectionToken)).toBe('smc_a_b')
    }
  })

  it('starts the outbound connection once stored', async () => {
    await storeHqLink(link)
    expect(mockRestart).toHaveBeenCalled()
  })
})
