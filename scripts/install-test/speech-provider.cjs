// Puts a speech provider (AssemblyAI or Inworld) in the database of HQ as installed, as a working provider with an
// obviously fake key, the way hq/e2e/fixtures/fake-providers.mjs does for a development HQ. Setup checks a speech key
// with its vendor at the vendor's own address, which no test may reach, so the install walkthrough answers the
// browser's add-provider call itself and runs this to make the stored state match.
//
// It runs inside the install's hq-server container, fed on standard input, so the database address and the key HQ
// encrypts its secrets with stay in that container's environment and are never read out of it:
//   docker exec -i <namespace>-hq-server node - assemblyai|inworld < scripts/install-test/speech-provider.cjs
// The container's working folder is the server's, from which its Prisma client resolves.
'use strict'
const { createCipheriv, randomBytes } = require('node:crypto')

const LABELS = { assemblyai: 'AssemblyAI', inworld: 'Inworld' }
const FAKE_KEY = 'sk-test-fake-not-a-key'
// HQ re-checks a working provider with its vendor every hour; a last check dated far ahead keeps one from falling due.
const NEVER_DUE = new Date('2100-01-01T00:00:00Z')

// hq's secretCrypto format: iv.tag.ciphertext, base64, AES-256-GCM.
function encrypt(plaintext, masterKey) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`
}

/** The row HQ stores for a working organisation provider of this vendor; `rawMasterKey` is SECRETS_MASTER_KEY. */
function providerRow(vendor, rawMasterKey, now = new Date()) {
  if (!Object.hasOwn(LABELS, vendor)) throw new Error(`Not a speech vendor: ${vendor}. Use assemblyai or inworld.`)
  const key = rawMasterKey ? Buffer.from(rawMasterKey, 'base64') : null
  if (!key || key.length !== 32) throw new Error('SECRETS_MASTER_KEY is missing or not 32 bytes: run this in the install’s hq-server container.')
  return {
    name: LABELS[vendor], vendor, credentialKind: 'api_key', baseUrl: null, secret: encrypt(FAKE_KEY, key),
    keyHint: FAKE_KEY.slice(-4), state: 'works', lastCheckedAt: NEVER_DUE, lastWorkedAt: now,
  }
}

async function main(vendor) {
  const data = providerRow(vendor, process.env.SECRETS_MASTER_KEY)
  const { PrismaClient } = require('@prisma/client')
  const db = new PrismaClient()
  try {
    const existing = await db.aiProvider.findFirst({ where: { vendor, ownerUserId: null } })
    if (!existing) await db.aiProvider.create({ data })
    console.log(`${data.name} is in the install’s database, with a fake key.`)
  } finally {
    await db.$disconnect()
  }
}

// Fed on standard input (`node -`), it runs; required, as its test does, it only exports.
if (process.argv[1] === '-') {
  main(process.argv[2]).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}

module.exports = { providerRow, encrypt, FAKE_KEY, LABELS }
