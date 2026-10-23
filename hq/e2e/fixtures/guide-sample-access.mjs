// One invitation still waiting to be accepted, so the join page has a link to open. (The providers are in
// guide-sample-models.mjs.) `encryptSecret` and `hqMasterKey` are shared with it.
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DAY = 24 * 60

// The same format as hq's secretCrypto.encryptSecret: iv.tag.ciphertext, base64, AES-256-GCM.
export function encryptSecret(plaintext, masterKey) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`
}

// hq's own key: from the environment (CI), else hq's .env.server (a developer's machine).
export function hqMasterKey(hqRoot) {
  let raw = process.env.SECRETS_MASTER_KEY
  const envFile = resolve(hqRoot, '.env.server')
  if (!raw && existsSync(envFile)) {
    raw = readFileSync(envFile, 'utf8').match(/^SECRETS_MASTER_KEY=["']?([^"'\n]+)/m)?.[1]
  }
  const key = raw ? Buffer.from(raw, 'base64') : null
  if (!key || key.length !== 32) {
    throw new Error('[seed-guide-data] SECRETS_MASTER_KEY is needed, the same one hq runs with, to store the sample model key and conversations.')
  }
  return key
}

export async function seedAccess({ hq, ago, people, projects, sample }) {
  const { token, name, projects: keys } = sample.invitation
  await hq.invite.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      role: 'MEMBER', note: name, projectIds: keys.map(k => projects[k].id),
      createdBy: people.sam.id, createdAt: ago(60), expiresAt: ago(-7 * DAY),
    },
  })
}
