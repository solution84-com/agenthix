import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// The JWT signing secret at rest, against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

const stored = async () => (await prisma.siteSecret.findUniqueOrThrow({ where: { type: 'JWT_SIGNING_SECRET' } })).value

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 2).toString('base64')

import { ensureSiteSecret, generateSiteSecret } from '../siteSecretService'
import { decryptSecret } from '../crypto/secretCrypto'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('the JWT signing secret at rest', () => {
  it('is stored encrypted and decrypts to the secret', async () => {
    const secret = await generateSiteSecret('JWT_SIGNING_SECRET')
    expect(await stored()).not.toContain(secret)
    expect(decryptSecret(await stored())).toBe(secret)
  })

  it('one stored in the clear is replaced at boot', async () => {
    await prisma.siteSecret.create({ data: { type: 'JWT_SIGNING_SECRET', value: 'a'.repeat(64) } })
    const fresh = await ensureSiteSecret('JWT_SIGNING_SECRET')
    expect(fresh).not.toBeNull()
    expect(decryptSecret(await stored())).toBe(fresh)
  })

  it('a missing one is generated at boot', async () => {
    const fresh = await ensureSiteSecret('JWT_SIGNING_SECRET')
    expect(decryptSecret(await stored())).toBe(fresh)
  })

  it('one already encrypted is kept at boot', async () => {
    await generateSiteSecret('JWT_SIGNING_SECRET')
    const before = await stored()
    expect(await ensureSiteSecret('JWT_SIGNING_SECRET')).toBeNull()
    expect(await stored()).toBe(before)
  })
})
