/**
 * Where hq keeps its connection to Cloud: the record (`CloudConnection`, one row while connected) and the key, with
 * hq's other secrets (`SiteSecret` 'CLOUD_CONNECTION_KEY'), its private half encrypted under SECRETS_MASTER_KEY and
 * decrypted only in memory, at use.
 */
import { prisma } from 'wasp/server'
import { generateCloudConnectionKeys, type CloudConnectionKeys } from '@agenthix/core/cloud-crypto'
import { decryptSecret, encryptSecret } from '../server/crypto/secretCrypto'
import type { CloudConnectionStore, CloudKeyStore } from './cloudConnection'

const KEY_TYPE = 'CLOUD_CONNECTION_KEY'
const ROW = 'singleton'

type StoredKey = { publicKey: string; privateKeyEnc: string }

export const cloudConnectionStore: CloudConnectionStore = {
  async read() {
    const row = await prisma.cloudConnection.findUnique({ where: { id: ROW } })
    return row
      ? { cloudOrganisationId: row.cloudOrganisationId, name: row.name, clientId: row.clientId, connectedAt: row.connectedAt.toISOString() }
      : null
  },
  async write(c) {
    const data = { cloudOrganisationId: c.cloudOrganisationId, name: c.name, clientId: c.clientId, connectedAt: new Date(c.connectedAt) }
    await prisma.cloudConnection.upsert({ where: { id: ROW }, create: { id: ROW, ...data }, update: data })
  },
  async clear() {
    await prisma.cloudConnection.deleteMany({})
  },
}

export const cloudKeyStore: CloudKeyStore = {
  async read() {
    const row = await prisma.siteSecret.findUnique({ where: { type: KEY_TYPE } })
    if (!row) return null
    const stored = JSON.parse(row.value) as StoredKey
    return { publicKey: stored.publicKey, privateKey: decryptSecret(stored.privateKeyEnc) }
  },
  async create(): Promise<CloudConnectionKeys> {
    const keys = await generateCloudConnectionKeys()
    const value = JSON.stringify({ publicKey: keys.publicKey, privateKeyEnc: encryptSecret(keys.privateKey) } satisfies StoredKey)
    await prisma.siteSecret.create({ data: { type: KEY_TYPE, value, prefix: null } })
    return keys
  },
  async clear() {
    await prisma.siteSecret.deleteMany({ where: { type: KEY_TYPE } })
  },
}
