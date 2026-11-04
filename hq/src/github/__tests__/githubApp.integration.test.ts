import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma } from '../../test/db'

// The GitHub App's row (SC-256, SC-262, R-168): stored with its secrets
// encrypted, read oldest first, and forgotten with its installations. Against
// the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

beforeAll(() => { process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64') })

import { storeAppFromConversion, getApp, getAppPrivateKey, disconnectApp } from '../githubApp'
import { recalledFacts, rememberAppOwner, rememberAppPermissions } from '../permissionFacts'
import { decryptSecret, encryptSecret } from '../../server/crypto/secretCrypto'

describe('githubApp registration @SC-256', () => {
  it('stores the conversion result with the private key and both secrets encrypted', async () => {
    await storeAppFromConversion({
      id: 12345, slug: 'agenthix-acme', pem: '-----BEGIN RSA PRIVATE KEY-----\nKEY\n-----END RSA PRIVATE KEY-----\n',
      webhook_secret: 'whsec', client_id: 'Iv1.abc', client_secret: 'cs_xyz',
    } as any)

    const row = await prisma.gitHubApp.findFirstOrThrow()
    expect(row).toMatchObject({ appId: 12345, slug: 'agenthix-acme', clientId: 'Iv1.abc' })
    expect(row.privateKey).not.toContain('BEGIN RSA PRIVATE KEY')
    expect(decryptSecret(row.privateKey)).toContain('BEGIN RSA PRIVATE KEY')
    expect(row.clientSecret).not.toBe('cs_xyz')
    expect(decryptSecret(row.clientSecret!)).toBe('cs_xyz')
    expect(row.webhookSecret).not.toBe('whsec')
    expect(decryptSecret(row.webhookSecret!)).toBe('whsec')
    expect(await getAppPrivateKey()).toContain('BEGIN RSA PRIVATE KEY')
  })

  it('treats a private key stored in the clear as no App, rather than signing with it', async () => {
    await prisma.gitHubApp.create({ data: { appId: 1, slug: 's', privateKey: '-----BEGIN RSA PRIVATE KEY-----\nKEY' } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(getAppPrivateKey()).rejects.toThrow(/No GitHub App is registered/)
  })
})

describe('getApp is deterministic (R-168)', () => {
  it('reads the oldest App first', async () => {
    await prisma.gitHubApp.create({ data: { appId: 2, slug: 'newer', privateKey: encryptSecret('k'), createdAt: new Date('2026-02-01') } })
    await prisma.gitHubApp.create({ data: { appId: 1, slug: 'older', privateKey: encryptSecret('k'), createdAt: new Date('2026-01-01') } })
    expect((await getApp())?.slug).toBe('older')
  })
})

describe('disconnect @SC-262', () => {
  it('forgets the App credential — deletes all installations and the app row', async () => {
    await prisma.gitHubApp.create({ data: { appId: 1, slug: 's', privateKey: encryptSecret('k') } })
    await prisma.gitHubInstallation.create({ data: { installationId: 7, accountLogin: 'acme', accountType: 'Organization' } })

    await disconnectApp()

    expect(await prisma.gitHubApp.count()).toBe(0)
    expect(await prisma.gitHubInstallation.count()).toBe(0)
  })

  it('forgets the remembered permissions and owner, so a newly registered App is read afresh', async () => {
    rememberAppPermissions({ contents: 'write' })
    rememberAppOwner({ login: 'acme', type: 'Organization' })
    await disconnectApp()
    expect(recalledFacts()).toMatchObject({ app: null, owner: null, at: 0 })
  })
})
