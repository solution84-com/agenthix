import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

// A site's machine credential against the real test database: a site added with
// a credential of its own, and the default site beside it.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { MACHINE_CREDENTIAL_PREFIX } from '@agenthix/core'
import { authenticateSite } from '../registrationService'
import { generateCredential, hashCredential } from '../credentials'
import { ensureDefaultSite } from '../defaultSite'

let admin: { id: string }
beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Test org' } })
  admin = await createUser()
})

async function enrol(siteId: string) {
  const { value, prefix } = generateCredential(MACHINE_CREDENTIAL_PREFIX)
  await prisma.executionSite.create({
    data: { siteId, label: 'Build box', status: 'REGISTERED', credentialHash: hashCredential(value), credentialPrefix: prefix, createdById: admin.id },
  })
  return { machineCredential: value }
}

describe('authenticateSite @SC-286', () => {
  it('accepts a site presenting its own credential, and refuses a wrong one or an unknown site', async () => {
    const { machineCredential } = await enrol('s1')
    await expect(authenticateSite('s1', machineCredential)).resolves.toMatchObject({ siteId: 's1' })
    await expect(authenticateSite('s1', 'smc_wrong')).resolves.toBeNull()
    await expect(authenticateSite('nope', machineCredential)).resolves.toBeNull()
  })

  it('refuses a revoked site even with the right credential', async () => {
    const { machineCredential } = await enrol('s1')
    await prisma.executionSite.update({ where: { siteId: 's1' }, data: { status: 'REVOKED' } })
    await expect(authenticateSite('s1', machineCredential)).resolves.toBeNull()
  })

  it('refuses a site row with no credential at all', async () => {
    await prisma.executionSite.create({ data: { siteId: 's-local', label: 'Local' } })
    await expect(authenticateSite('s-local', 'anything')).resolves.toBeNull()
  })

  describe('beside the default site', () => {
    const SECRET = 'd'.repeat(64)
    beforeEach(async () => {
      process.env.HQ_PAIRING_SECRET = SECRET
      await ensureDefaultSite()
    })
    afterEach(() => {
      delete process.env.HQ_PAIRING_SECRET
    })

    it('a wrong credential from an unknown id is refused, and the default row keeps its id', async () => {
      const before = await prisma.executionSite.findFirstOrThrow({ where: { isDefault: true } })
      await expect(authenticateSite('site-new', 'wrong')).resolves.toBeNull()
      expect((await prisma.executionSite.findFirstOrThrow({ where: { isDefault: true } })).siteId).toBe(before.siteId)
    })

    it('a registered site authenticating leaves the default row alone', async () => {
      const before = await prisma.executionSite.findFirstOrThrow({ where: { isDefault: true } })
      const { machineCredential } = await enrol('s1')
      await expect(authenticateSite('s1', machineCredential)).resolves.toMatchObject({ siteId: 's1', isDefault: false })
      expect(await prisma.executionSite.findFirstOrThrow({ where: { isDefault: true } })).toEqual(before)
    })
  })
})
