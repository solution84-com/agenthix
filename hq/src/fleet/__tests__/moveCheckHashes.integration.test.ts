/**
 * The hashes hq answers the move check with (host-management spec §13), against the real test database: only those
 * of sites, machines and the Fleet Console that may still connect.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})
vi.mock('../../auth/hqLinks', () => ({ hqAddress: () => 'http://198.51.100.24:4100' }))

import { moveCheckHashes } from '../moveCheckApi'

const hash = (c: string) => c.repeat(64)

describe('the hashes the move check holds @SC-936', () => {
  it('takes live sites, connected machines and the current Fleet Console only', async () => {
    await prisma.executionSite.createMany({
      data: [
        { siteId: 'live', label: 'office-server', credentialHash: hash('a') },
        { siteId: 'removed', label: 'laptop', credentialHash: hash('b'), revokedAt: new Date() },
        { siteId: 'local', label: 'hq-box', credentialHash: null, isDefault: true },
      ],
    })
    await prisma.relayHost.createMany({
      data: [
        { fingerprint: 'e'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'office-server', consoleFingerprint: 'm'.repeat(64), credentialHash: hash('c') },
        { fingerprint: 'f'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'laptop', consoleFingerprint: 'm'.repeat(64), credentialHash: null, disconnectedAt: new Date() },
      ],
    })
    await prisma.consoleCredential.create({ data: { credentialHash: hash('d'), issuedAt: new Date() } })

    expect(await moveCheckHashes('site')).toEqual([hash('a')])
    expect(await moveCheckHashes('host')).toEqual([hash('c')])
    expect(await moveCheckHashes('console')).toEqual([hash('d')])
  })
})
